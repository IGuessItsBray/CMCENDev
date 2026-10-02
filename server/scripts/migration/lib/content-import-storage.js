const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

async function bounded(stream, expectedBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > expectedBytes) throw new Error('OBJECT_TOO_LARGE');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function contentObjectStore({ client, bucket, endpoint, publicOrigin }) {
  const target = {
    endpointOrigin: new URL(endpoint).origin,
    bucket,
    publicOrigin,
  };
  return {
    target,
    async get(key, bytes) {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(30000) },
        );
        if (
          response.ContentLength !== undefined &&
          response.ContentLength !== bytes
        )
          throw new Error('OBJECT_SIZE_DIFFERS');
        return await bounded(response.Body, bytes);
      } catch (error) {
        // Generic 404 may indicate a missing or misrouted bucket. Only an
        // explicit S3 object-absence code authorizes a conditional upload.
        if (error.name === 'NoSuchKey') return null;
        throw error;
      }
    },
    async putIfAbsent(key, body, mimeType) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: mimeType,
            IfNoneMatch: '*',
          }),
          { abortSignal: AbortSignal.timeout(30000) },
        );
      } catch (error) {
        if (
          error.name !== 'PreconditionFailed' &&
          error.$metadata?.httpStatusCode !== 412
        )
          throw error;
      }
    },
    async publicGet(url, bytes) {
      if (new URL(url).origin !== publicOrigin)
        throw new Error('UNAPPROVED_PUBLIC_ORIGIN');
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('PUBLIC_OBJECT_UNAVAILABLE');
      return bounded(response.body, bytes);
    },
  };
}

module.exports = { bounded, contentObjectStore };
