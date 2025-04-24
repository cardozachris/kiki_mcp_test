# MCP Test Application

This is a test application for the Model Context Protocol (MCP) using Server-Sent Events (SSE).

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. Set up Redis:

   - Install Redis locally or use a cloud service like Redis Cloud
   - Update the `.env.local` file with your Redis configuration

4. Run the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Troubleshooting

### Redis Authentication Issues

If you see the error `NOAUTH Authentication required`, make sure you have set the `REDIS_PASSWORD` environment variable in your `.env.local` file.

### SSE Connection Issues

If you have trouble connecting to the SSE endpoint, make sure:

1. The URL in `app/api/chat/route.ts` is correctly set to an absolute URL
2. Your Redis server is running and accessible
3. The environment variables are correctly set

## Environment Variables

- `REDIS_HOST`: The hostname of your Redis server
- `REDIS_PORT`: The port of your Redis server
- `REDIS_PASSWORD`: The password for your Redis server

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
