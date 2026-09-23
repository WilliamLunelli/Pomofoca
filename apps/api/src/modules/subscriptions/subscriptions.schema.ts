import { z } from 'zod';

export const mercadoPagoWebhookSchema = z
  .object({
    type: z.string().optional(),
    action: z.string().optional(),
    data: z.object({ id: z.string() }).optional(),
  })
  .passthrough();
export type MercadoPagoWebhookInput = z.infer<typeof mercadoPagoWebhookSchema>;
