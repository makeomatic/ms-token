import type { SecretSettings } from '../utils/crypto'

/**
 * Create Token Structure
 */
export type Token = {
  /**
   * id passed to create the token
   */
  id: string;

  /**
   * action passed to create the token
   */
  action: string;

  /**
   * send secret to user for completing challenge (for instance via SMS).
   * Secret is not present if was set to false
   */
  secret?: string;

  /**
   * token unique identificator, when regenerate is true
   */
  uid?: string;
}

/**
 * Options that must be processed by backends
 */
export type CreateOpts = {
  /**
   * unique action name, non-empty string
   */
  action: string;

  /**
   * unique request identification. For instance, if you are going to send this to an email,
   * use email as id. If this is going to be a token sent to the phone -
   * use normalized phone number. Combination of action & id grants access to
   * secret, while secret grants access to all associated metadata
   */
  id: string;

  /**
   * token expiration, in seconds
   */
  ttl?: number;

  /**
   * - true: would be equal to args.ttl, in that case ttl must be defined
   * - number: do not allow creating token for args.{action,id} combo for Number amount of seconds.
   *     Sometimes you want throttle to be small (60 seconds), and ttl to be 15 mins (text messages),
   *     or 2 hours and 24 hours (emails)
   */
  throttle?: boolean | number;

  /**
   * Mixed content, must be able to JSON.stringify it
   */
  metadata?: any;

  /**
   * - true, default. in that case secret would be automatically generated and would include encrypted public data + generated secret
   * - false, do not generate secret. In that case it would simply use action + id for verification/unlocking
   * - object: refer to secret settings
   */
  secret?: SecretSettings

  /**
   * defauls to false. If set to true would allow usage of .regenerate() API by returning uid of this challenge
   */
  regenerate?: boolean

  /**
   * internally prepared metadata
   */
  created: number;

  /**
   * externally generated token unique identificator
   */
  uid?: string;
}

/**
 * args, must have one of uid, args.action and args.id combo or args.secret + args.encrypt combo
 */
export type InfoOpts = {
  [key: string]: unknown;

  uid?: string;
  id?: string;
  action?: string;
  token?: string;
}

/**
 * Works with both uid OR action& id combo. Sometimes challenge token might not
 * reach the user and the user would want to ask for another challenge token.
 * Idea of this is to accept public challenge uid, which would use previous data p
 * assed in .create(args) and generate new secret based on this.
 * Can only be used when regenerate was set to true on the .create(args) action
 */
export type RegenerateOpts = {
  uid: string
} | {
  action: string;
  id: string;
}

export type VerifyOpts = {
  action: string;
  id: string;
  token: string;
}

export type VerifySettings = {
  /**
   * Defaults to true
   */
  erase?: boolean

  /**
   * when true logs attempt time
   */
  log?: boolean;

  /**
   * verifies that decrypted args contains same values
   */
  control?: {
    id?: string;
    action?: string;
  };
}

/**
 * Response, always Object in case of successful verification:
 */
export type Response = {
  /**
   * id of a entity for which a secret was initially generated
   */
  id: string;
  /**
   * action for which secret was generated
   */
  action: string;
  /**
   * serial number of the issued secret
   */
  uid: string;
  /**
   * Verification secret
   */
  secret: string;
  /**
   * Time when secret was created
   */
  created: number;
  /**
   * Settings used to generate secret
   */
  settings: SecretSettings;
  /**
   * Any associated metadata
   */
  metadata: any;
  /**
   * Shows that current verification is first or not
   */
  isFirstVerification: boolean;
  /**
   * Time when token was verified
   */
  verified: number;
  /**
   * Holds information about earlier issued tokens when regenerate is used
   */
  related?: string;
}

/**
 * - args as String, we would attempt to decode & verify in according with encryption settings
 * - args as Object:
 *    - args.uid - either uid OR action & id combination
 *    - args.action - action from .create()
 *    - args.id - id from .create()
 */
export type RemoveOpts = {
  uid?: string;
  action?: string;
  id?: string;
  token?: string
}

export type UpdateSecret = {
  (id: string, action: string, uid: string, secret: SecretSettings): Promise<string>
}

export abstract class Backend {
  abstract create(settings: CreateOpts): Promise<{ ok: 200 }>
  abstract regenerate(opts: RegenerateOpts, updateSecret: UpdateSecret): Promise<string>
  abstract info(opts: InfoOpts): Promise<Response>
  abstract verify(opts: VerifyOpts, settings: VerifySettings): Promise<Response>
  abstract remove(opts: RemoveOpts): Promise<{ ok: 200 }>
}
