import { eq } from "drizzle-orm";
import {
  db,
  driverWalletsTable,
  walletTransactionsTable,
  driverPayoutsTable,
  ridesTable,
} from "@workspace/db";

const PLATFORM_COMMISSION_PERCENT = 15; // 15% platform commission

/**
 * Ensures a driver has a wallet created.
 */
export async function getOrCreateDriverWallet(driverId: string) {
  let wallet = await db.query.driverWalletsTable.findFirst({
    where: eq(driverWalletsTable.driverId, driverId),
  });

  if (!wallet) {
    const [created] = await db
      .insert(driverWalletsTable)
      .values({
        driverId,
        availableBalance: "0.00",
        pendingBalance: "0.00",
        totalEarned: "0.00",
        totalPaidOut: "0.00",
      })
      .returning();
    wallet = created;
  }

  return wallet;
}

/**
 * Credits driver wallet upon trip completion with immutable ledger entries:
 * 1. Fare credit
 * 2. Platform commission debit (e.g. 15%)
 * 3. Driver tip credit (100% to driver)
 * 4. Waiting charge credit
 */
export async function recordTripEarnings(params: {
  rideId: string;
  driverId: string;
  fareAmount: number;
  tipAmount?: number;
  waitingCharges?: number;
}) {
  const { rideId, driverId, fareAmount, tipAmount = 0, waitingCharges = 0 } = params;

  return await db.transaction(async (tx) => {
    let wallet = await tx.query.driverWalletsTable.findFirst({
      where: eq(driverWalletsTable.driverId, driverId),
    });

    if (!wallet) {
      const [created] = await tx
        .insert(driverWalletsTable)
        .values({
          driverId,
          availableBalance: "0.00",
          pendingBalance: "0.00",
          totalEarned: "0.00",
          totalPaidOut: "0.00",
        })
        .returning();
      wallet = created;
    }

    let currentBalance = Number(wallet.availableBalance);

    // 1. Gross Fare Credit
    const balanceAfterFare = currentBalance + fareAmount;
    await tx.insert(walletTransactionsTable).values({
      walletId: wallet.id,
      rideId,
      type: "fare_credit",
      amount: String(fareAmount),
      balanceBefore: String(currentBalance),
      balanceAfter: String(balanceAfterFare),
      description: `Gross fare for trip #${rideId.slice(0, 8)}`,
    });
    currentBalance = balanceAfterFare;

    // 2. Platform Commission Debit
    const commission = Math.round((fareAmount * (PLATFORM_COMMISSION_PERCENT / 100)) * 100) / 100;
    const balanceAfterCommission = currentBalance - commission;
    await tx.insert(walletTransactionsTable).values({
      walletId: wallet.id,
      rideId,
      type: "platform_commission_debit",
      amount: String(commission),
      balanceBefore: String(currentBalance),
      balanceAfter: String(balanceAfterCommission),
      description: `Platform fee (${PLATFORM_COMMISSION_PERCENT}%) for trip #${rideId.slice(0, 8)}`,
    });
    currentBalance = balanceAfterCommission;

    // 3. Waiting Charges (if any)
    if (waitingCharges > 0) {
      const balanceAfterWait = currentBalance + waitingCharges;
      await tx.insert(walletTransactionsTable).values({
        walletId: wallet.id,
        rideId,
        type: "waiting_charge_credit",
        amount: String(waitingCharges),
        balanceBefore: String(currentBalance),
        balanceAfter: String(balanceAfterWait),
        description: `Waiting time compensation for trip #${rideId.slice(0, 8)}`,
      });
      currentBalance = balanceAfterWait;
    }

    // 4. Tip (100% to driver)
    if (tipAmount > 0) {
      const balanceAfterTip = currentBalance + tipAmount;
      await tx.insert(walletTransactionsTable).values({
        walletId: wallet.id,
        rideId,
        type: "tip_credit",
        amount: String(tipAmount),
        balanceBefore: String(currentBalance),
        balanceAfter: String(balanceAfterTip),
        description: `Passenger tip for trip #${rideId.slice(0, 8)}`,
      });
      currentBalance = balanceAfterTip;
    }

    const netEarned = fareAmount - commission + waitingCharges + tipAmount;
    const newTotalEarned = Number(wallet.totalEarned) + netEarned;

    // Update wallet master balances
    const [updatedWallet] = await tx
      .update(driverWalletsTable)
      .set({
        availableBalance: String(Math.round(currentBalance * 100) / 100),
        totalEarned: String(Math.round(newTotalEarned * 100) / 100),
        updatedAt: new Date(),
      })
      .where(eq(driverWalletsTable.id, wallet.id))
      .returning();

    return updatedWallet;
  });
}

/**
 * Processes payout request from driver's available wallet balance.
 */
export async function requestPayout(params: {
  driverId: string;
  amount: number;
  payoutMethod?: string;
}) {
  const { driverId, amount, payoutMethod = "bank_transfer" } = params;

  return await db.transaction(async (tx) => {
    const wallet = await tx.query.driverWalletsTable.findFirst({
      where: eq(driverWalletsTable.driverId, driverId),
    });

    if (!wallet || Number(wallet.availableBalance) < amount) {
      throw new Error("Insufficient wallet balance for payout.");
    }

    const currentBalance = Number(wallet.availableBalance);
    const newBalance = currentBalance - amount;
    const newPaidOut = Number(wallet.totalPaidOut) + amount;

    // Record payout record
    const [payout] = await tx
      .insert(driverPayoutsTable)
      .values({
        driverId,
        amount: String(amount),
        status: "completed",
        payoutMethod,
        processedAt: new Date(),
      })
      .returning();

    // Record ledger debit
    await tx.insert(walletTransactionsTable).values({
      walletId: wallet.id,
      type: "payout_debit",
      amount: String(amount),
      balanceBefore: String(currentBalance),
      balanceAfter: String(newBalance),
      description: `Payout #${payout.id.slice(0, 8)} to ${payoutMethod}`,
      referenceId: payout.id,
    });

    // Update wallet balance
    await tx
      .update(driverWalletsTable)
      .set({
        availableBalance: String(Math.round(newBalance * 100) / 100),
        totalPaidOut: String(Math.round(newPaidOut * 100) / 100),
        updatedAt: new Date(),
      })
      .where(eq(driverWalletsTable.id, wallet.id));

    return payout;
  });
}
