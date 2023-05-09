import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3'
import { GenericContainer, Wait } from 'testcontainers'
import { customAlphabet } from 'nanoid'

export async function createS3 () {
  const minio = await new GenericContainer('quay.io/minio/minio')
    .withCommand(['server', '/data'])
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forLogMessage(/1 Online/, 1))
    .withReuse()
    .start()
  const s3 = new S3Client({
    endpoint: `http://127.0.0.1:${minio.getMappedPort(9000)}`,
    forcePathStyle: true,
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadmin'
    }
  })
  return s3
}

export async function createBucket (s3) {
  const id = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 10)
  const Bucket = id()
  await s3.send(new CreateBucketCommand({ Bucket }))
  return Bucket
}
