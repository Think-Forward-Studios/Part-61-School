'use client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@part61/api';

export const trpc = createTRPCReact<AppRouter>();
