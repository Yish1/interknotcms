export interface ApiResponse<T> {
    message: string;
    data: T;
}
export interface Pagination {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    pagination: Pagination;
}
export type UserRole = 'admin' | 'editor' | 'user';
export interface AuthenticatedUser {
    sub: string;
    username: string;
    role: UserRole;
    authVersion: number;
}
export interface UserProfile {
    id: string;
    username: string;
    email: string;
    phone: string | null;
    avatar: string | null;
    role: UserRole;
    isActive: boolean;
    emailVerifiedAt: string | null;
    phoneVerifiedAt: string | null;
    lastLoginAt: string | null;
    createdAt: string;
}
export interface LoginInput {
    username: string;
    password: string;
}
export interface LoginResult {
    user: UserProfile;
    accessToken: string;
}
//# sourceMappingURL=types.d.ts.map