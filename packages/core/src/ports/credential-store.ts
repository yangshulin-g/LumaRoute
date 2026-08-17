export interface CredentialStore {
  set(credentialKey: string, token: string): Promise<void>
  get(credentialKey: string): Promise<string | null>
  delete(credentialKey: string): Promise<void>
}
