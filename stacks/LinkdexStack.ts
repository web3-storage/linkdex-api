import { StackContext, Api, Bucket } from "@serverless-stack/resources"
import { aws_s3 as s3 } from 'aws-cdk-lib'

export function LinkdexStack({ app, stack }: StackContext) {
  // either import an existing bucket or create a new one for dev.
  // see: https://docs.sst.dev/advanced/importing-resources
  const bucket = (process.env.BUCKET_NAME)
    ? new Bucket(stack, 'existing-cars', { cdk: { bucket: s3.Bucket.fromBucketName(stack, 'imported-cars', process.env.BUCKET_NAME) }})
    : new Bucket(stack, 'cars')

  const zone = 'linkdex.dag.haus'
  const domain = app.stage === 'prod' ? zone : `${app.stage}.${zone}`

  const api = new Api(stack, "api", {
    customDomain: { 
      domainName: domain,
      hostedZone: zone
    },
    defaults: {
      function: {
        permissions: [bucket],
        environment: { BUCKET_NAME: bucket.bucketName },
        architecture: 'arm_64', // cheaper, so why not?
        timeout: 0 // default is 10s
      }
    },
    routes: {
      "GET /": "functions/linkdex.handler",
    }
  })
  stack.addOutputs({
    ApiEndpoint: api.url
  })
}
