export { default } from 'next-auth/middleware';

// Every page needs sign-in, except the sign-in routes themselves.
export const config = { matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'] };
