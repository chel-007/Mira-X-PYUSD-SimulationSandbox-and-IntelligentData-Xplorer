// import { request, gql } from 'graphql-request';
import { NextResponse } from 'next/server';

// export async function POST(req: Request) {
//   const { owner, pool } = await req.json();
//   const query = gql`
//     query GetPositions($owner: String!, $pool: String!) {
//       positions(where: {owner: $owner, pool: $pool}) {
//         id
//         liquidity
//         tickLower { tickIdx }
//         tickUpper { tickIdx }
//       }
//     }
//   `;
//   try {
//     const data = await request(subgraphUrl, query, { owner, pool });
//     console.log(data)
//     return NextResponse.json(data);
//   } catch (error) {
//     console.error('Subgraph error:', error);
//     return NextResponse.json({ error: 'Failed to fetch subgraph data' }, { status: 500 });
//   }
// }

