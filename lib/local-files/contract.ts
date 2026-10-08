import { z } from 'zod';
export const localCatalogSchema = z.array(z.object({ sourceId: z.string().uuid(), name: z.string().max(300), version: z.string().max(100), size: z.number().int().max(512 * 1024 * 1024).optional(), location: z.literal('local'), readable: z.boolean(), needsReconnect: z.boolean() })).max(100);
export type LocalSourceCatalog = z.infer<typeof localCatalogSchema>;
export const localReadInputSchema = z.object({ sourceId: z.string().uuid(), operation: z.enum(['catalog', 'read', 'search']), page: z.number().int().min(1).optional(), offset: z.number().int().min(0).optional(), query: z.string().min(1).max(300).optional() });
export type LocalReadInput = z.infer<typeof localReadInputSchema>;
export interface LocalReadOutput {
    text: string;
    sourceId: string;
    sourceVersion: string;
    found: boolean;
    nextOffset?: number | null;
    nextPage?: number | null;
    page?: number;
    image?: {
        dataUrl: string;
        mimeType: 'image/jpeg';
    };
}
export const localReadOutputSchema = z.object({ text: z.string().max(12000), sourceId: z.string().uuid(), sourceVersion: z.string().max(100), found: z.boolean(), nextOffset: z.number().nullable().optional(), nextPage: z.number().nullable().optional(), page: z.number().optional(), image: z.object({ dataUrl: z.string().max(1024 * 1024).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/), mimeType: z.literal('image/jpeg') }).optional() });
