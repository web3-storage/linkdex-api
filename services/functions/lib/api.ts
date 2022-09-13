import { APIGatewayProxyStructuredResultV2 } from "aws-lambda"

export function response (body: any, opts: APIGatewayProxyStructuredResultV2 = {}): APIGatewayProxyStructuredResultV2 {
  return {
    ...opts,
    statusCode: opts.statusCode ?? 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers),
    body: JSON.stringify(body)
  }
}
