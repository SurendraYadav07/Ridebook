module.exports = ({ config }) => {
  const apiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_CLIENT_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    '';
  if (process.env.EAS_BUILD === 'true' && !apiKey) {
    throw new Error('Set EXPO_PUBLIC_GOOGLE_MAPS_CLIENT_API_KEY for EAS builds.');
  }
  if (process.env.EAS_BUILD === 'true' && !process.env.EXPO_PUBLIC_API_URL && !process.env.EXPO_PUBLIC_DOMAIN) {
    throw new Error('Set EXPO_PUBLIC_API_URL for EAS builds.');
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey: apiKey,
      },
    },
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey,
        },
      },
    },
  };
};
