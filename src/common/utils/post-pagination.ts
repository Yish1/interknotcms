// src/common/utils/post-pagination.ts

import { Prisma } from '../../generated/prisma/client.js';

export type PostSort = 'latest' | 'views' | 'updated';

export interface PaginationQuery {
  skip: number;
  take: number;
}

export function getPagination(page: number, pageSize: number): PaginationQuery {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function getPostPagination(
  page: number,
  pageSize: number,
  sort: PostSort,
): {
  skip: number;
  take: number;
  orderBy: Prisma.PostOrderByWithRelationInput[];
} {
  const orderBy: Prisma.PostOrderByWithRelationInput[] =
    sort === 'views'
      ? [{ viewCount: 'desc' }, { updatedAt: 'desc' }]
      : sort === 'updated'
        ? [{ updatedAt: 'desc' }]
        : [{ publishedAt: 'desc' }, { updatedAt: 'desc' }];

  return {
    ...getPagination(page, pageSize),
    orderBy,
  };
}

export function createPaginationMeta(
  page: number,
  pageSize: number,
  total: number,
) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}
