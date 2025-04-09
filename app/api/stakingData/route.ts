// import { request, gql } from 'graphql-request';
import { NextResponse } from 'next/server';

const subgraphUrl = 'https://gateway.thegraph.com/api/57e9956c0fb785721d6c7141d45346f4/subgraphs/id/apikey';

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

