import webpush from 'web-push';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://pomofoca:pomofoca@localhost:5432/pomofoca_test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_at_least_32_characters_long';
process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_at_least_32_characters_long';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.MERCADO_PAGO_ACCESS_TOKEN ??= 'test-mp-token';
process.env.MERCADO_PAGO_WEBHOOK_SECRET ??= 'test-mp-webhook-secret';

// par gerado a cada execução, só para teste; sempre sobrescreve, para os testes nunca usarem chaves reais
const vapidKeys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
process.env.VAPID_SUBJECT ??= 'mailto:test@example.com';

