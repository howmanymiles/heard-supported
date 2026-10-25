export { default } from 'next-auth/middleware';

// Every page needs sign-in, except sign-in itself, the sign-in problem page,
// invitation links and agency sign-up.
export const config = { matcher: ['/((?!api/auth|access|invite|signup|_next/static|_next/image|favicon.ico).*)'] };
