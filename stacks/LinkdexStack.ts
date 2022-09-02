import { StackContext, Api, Bucket } from "@serverless-stack/resources";

export function LinkdexStack({ stack }: StackContext) {

  const bucket = new Bucket(stack, 'cars')

  const api = new Api(stack, "api", {
    defaults: {
      function: {
        permissions: [bucket]
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
