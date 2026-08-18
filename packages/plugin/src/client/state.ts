export type ClientAuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'detecting-browser' }
  | { status: 'installing-browser'; progress?: number }
  | { status: 'launching-browser' }
  | { status: 'waiting-for-login' }
  | { status: 'validating' }
  | { status: 'signed-in'; account?: { accountHash: string }; browser?: { kind: string } }
  | { status: 'error'; message: string }
