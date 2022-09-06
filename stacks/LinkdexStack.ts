import { StackContext, Api, Bucket } from "@serverless-stack/resources";

export function LinkdexStack({ app,stack }: StackContext) {

  const bucket = new Bucket(stack, 'cars')

  const api = new Api(stack, "api", {
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
