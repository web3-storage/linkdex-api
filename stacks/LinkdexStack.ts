import { StackContext, Api, Bucket } from "sst/constructs"
import { aws_s3 as s3 } from 'aws-cdk-lib'

export function LinkdexStack({ app, stack }: StackContext) {
  // either import an existing bucket or create a new one for dev.
  // see: https://docs.sst.dev/advanced/importing-resources
  const bucketName = process.env.BUCKET_NAME
  const bucket = (bucketName)
    ? new Bucket(stack, 'existing-cars', { cdk: { bucket: s3.Bucket.fromBucketName(stack, 'imported-cars', bucketName) }})
    : new Bucket(stack, 'cars')

  const customDomain = getCustomDomain(app.stage, process.env.HOSTED_ZONE)

  const api = new Api(stack, 'api', {
    customDomain,
    routes: {
      "GET /": {
        function: {
          handler: 'services/functions/linkdex.handler'
        }
      },
      "GET /cid/{cid}": {
        function: {
          handler: 'services/functions/linkdex-cid.handler'
        }
      }
    },
    defaults: {
      function: {
        permissions: [bucket],
        environment: { BUCKET_NAME: bucket.bucketName },
        architecture: 'arm_64', // cheaper, so why not?
        timeout: '15 minutes',  // default is 10s. Api gateway has 30s limit. Lambda max 15 mins.
        url: true
      }
    }
  })

  stack.addOutputs({
    CustomDomain: customDomain ? `https://${customDomain.domainName}` : 'Set HOSTED_ZONE in env to deploy to a custom domain'
  })
}

function getCustomDomain (stage: string, hostedZone?: string) {
  if (!hostedZone) {
    return undefined
  }
  const domainName = stage === 'prod' ? hostedZone : `${stage}.${hostedZone}`
  return { domainName, hostedZone }
}