// Web continues to use the browser OAuth flow; never import a native module here.
export async function signInWithNativeGoogle() {
  throw new Error("Native Google sign-in is unavailable on web");
}

export async function signOutNativeGoogle() {}
