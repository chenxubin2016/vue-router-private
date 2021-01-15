/* @flow */

import { inBrowser } from './dom'
import { saveScrollPosition } from './scroll'
import { genStateKey, setStateKey, getStateKey } from './state-key'
import { extend } from './misc'

export const supportsPushState =
  inBrowser &&
  (function () {
    const ua = window.navigator.userAgent

    if (
      (ua.indexOf('Android 2.') !== -1 || ua.indexOf('Android 4.0') !== -1) &&
      ua.indexOf('Mobile Safari') !== -1 &&
      ua.indexOf('Chrome') === -1 &&
      ua.indexOf('Windows Phone') === -1
    ) {
      return false
    }

    return window.history && typeof window.history.pushState === 'function'
  })()

export function pushState (url?: string, replace?: boolean) {
  saveScrollPosition()
  // try...catch the pushState call to get around Safari
  // DOM Exception 18 where it limits to 100 pushState calls
  // 加了 try...catch 是因为 Safari 有调用 pushState 100 次限制
  // 一旦达到就会抛出 DOM Exception 18 错误
  const history = window.history
  try {
    if (replace) {
      // preserve existing history state as it could be overriden by the user
      // replace 的话 key 还是当前的 key 没必要生成新的
      const stateCopy = extend({}, history.state)
      stateCopy.key = getStateKey()
      history.replaceState(stateCopy, '', url)
    } else {
      history.pushState({ key: setStateKey(genStateKey()) }, '', url)
    }
  } catch (e) {
    // 达到限制了 则重新指定新的地址
    window.location[replace ? 'replace' : 'assign'](url)
  }
}

export function replaceState (url?: string) {
  pushState(url, true)
}
