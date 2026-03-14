/* js/config.js — App-wide configuration */
/* NOTE: The Amap API key below is a client-side browser key that is inherently
 * public.  Restrict its usage to authorised domains in the Amap console
 * (https://console.amap.com) to prevent abuse. */
const CONFIG = {
  AMAP_KEY: '1ae1b4a6c27c553d76869aa1ec4c440f',
  APP_NAME:  'PanoMap',

  // Default map center (Beijing)
  DEFAULT_CENTER: [116.4074, 39.9042],
  DEFAULT_ZOOM:   10,

  // IndexedDB
  DB_NAME:    'panomap_db',
  DB_VERSION: 1,

  // localStorage keys
  LS_USERS:   'pm_users',
  LS_PANOS:   'pm_panos',
  LS_SESSION: 'pm_session',
};
