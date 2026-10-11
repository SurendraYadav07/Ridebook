import { Router, type IRouter } from "express";
import { authenticate } from "../middleware/auth";
import { validatePromoCode } from "../lib/fare";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /promos/validate — Validate promo code and compute discount
// ---------------------------------------------------------------------------
router.post("/promos/validate", authenticate, async (req, res) => {
  const { code, rideType = "economy", fare = 100 } = req.body;

  if (!code || typeof code !== "string" || !code.trim()) {
    res.status(400).json({ error: "invalid_request", message: "Promo code is required." });
    return;
  }

  const normalizedCode = code.trim().toUpperCase();
  const fareNumber = Number(fare) || 100;

  try {
    const result = await validatePromoCode({
      code: normalizedCode,
      userId: req.auth!.userId,
      rideType: rideType as any,
      fareBeforeDiscount: fareNumber,
    });

    if (!result.valid) {
      res.status(200).json({
        valid: false,
        code: normalizedCode,
        discountAmount: 0,
        finalFare: fareNumber,
        message: result.reason || "Invalid promo code.",
      });
      return;
    }

    const discountAmount = result.discountAmount ?? 0;
    const finalFare = Math.max(0, Math.round((fareNumber - discountAmount) * 100) / 100);

    res.status(200).json({
      valid: true,
      code: normalizedCode,
      discountAmount,
      finalFare,
      message: result.message || "Promo code applied successfully!",
      promoCodeId: result.promoCodeId,
    });
  } catch (err: any) {
    console.error("[POST /promos/validate] Error:", err);
    res.status(500).json({ error: "validation_error", message: "Failed to validate promo code." });
  }
});

export default router;
