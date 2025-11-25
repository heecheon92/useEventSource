import { z } from "zod";

export const sseContainerSchema = z.object({
	payload: z.unknown(),
});

export type SSEPayloadSchema = Record<string, z.ZodSchema>;
export type SSEHandlerType<
	TSchema extends SSEPayloadSchema = SSEPayloadSchema,
	TSchemaKey extends keyof TSchema = keyof TSchema,
> = {
	eventName: TSchemaKey;
	handler: (data: z.infer<TSchema[TSchemaKey]>) => void;
};
export type SSEDescriptor<TSchema extends SSEPayloadSchema = SSEPayloadSchema> =
	{
		[K in keyof TSchema]: SSEHandlerType<TSchema, K>;
	}[keyof TSchema];
export type SSEDescriptorProcessor = <K extends keyof SSEPayloadSchema>(
	descriptor: SSEDescriptor,
	data: z.infer<SSEPayloadSchema[K]>,
) => void;

export function processDescriptor<
	TSchema extends SSEPayloadSchema,
	K extends keyof TSchema,
>(descriptor: SSEDescriptor<TSchema>, data: z.infer<TSchema[K]>) {
	descriptor.handler(data);
}
