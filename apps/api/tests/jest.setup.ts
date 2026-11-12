process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://pomofoca:pomofoca@localhost:5432/pomofoca_test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_at_least_32_characters_long';
process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_at_least_32_characters_long';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.MERCADO_PAGO_ACCESS_TOKEN ??= 'test-mp-token';
process.env.MERCADO_PAGO_WEBHOOK_SECRET ??= 'test-mp-webhook-secret';
process.env.VAPID_PUBLIC_KEY ??=
  'BLkeUceHV9caj9fODs5Rd2UYEcdh6vY3ph_wl6QogFrJlAro9hF5OIRazliuIcAUSTYSDAStcXiVvPoZmywFiDg';
process.env.VAPID_PRIVATE_KEY ??= 'eN8IV9TL4BXR0HeX5crWTt70SieAVY5HXRxJNGRquCc';
process.env.VAPID_SUBJECT ??= 'mailto:test@example.com';
