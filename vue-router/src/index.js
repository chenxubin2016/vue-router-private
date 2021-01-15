/* @flow */

import { install } from './install'
import { START } from './util/route'
import { assert } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'
import { handleScroll } from './util/scroll'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'

import { isNavigationFailure, NavigationFailureType } from './util/errors'

export default class VueRouter {
  // 在VueRouter类中定义install静态方法
  static install: () => void
  static version: string
  static isNavigationFailure: Function
  static NavigationFailureType: any

  app: any
  apps: Array<any>
  ready: boolean
  readyCbs: Array<Function>
  options: RouterOptions
  mode: string
  history: HashHistory | HTML5History | AbstractHistory
  matcher: Matcher
  fallback: boolean
  beforeHooks: Array<?NavigationGuard>
  resolveHooks: Array<?NavigationGuard>
  afterHooks: Array<?AfterNavigationHook>

  constructor(options: RouterOptions = {}) {
    this.app = null
    this.apps = []
    this.options = options
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []
    // 创建 matcher 匹配函数，createMatcher函数返回 {match, addRoutes}
    this.matcher = createMatcher(options.routes || [], this)
    // 默认hash模式
    let mode = options.mode || 'hash'
    // h5的history有兼容性问题 对history做降级处理
    this.fallback =
      mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      mode = 'hash'
    }
    if (!inBrowser) {
      mode = 'abstract'
    }
    this.mode = mode
    // 不同的mode，实例化不同的History类, 后面的this.history就是History的实例
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
  }

  match(raw: RawLocation, current?: Route, redirectedFrom?: Location): Route {
    return this.matcher.match(raw, current, redirectedFrom)
  }

  get currentRoute(): ?Route {
    return this.history && this.history.current
  }

  init(app: any /* Vue component instance */) {
    process.env.NODE_ENV !== 'production' &&
    assert(
      install.installed,
      `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
      `before creating root instance.`
    )
    // vue可能会实例化多次 apps用于存放多个vue实例
    this.apps.push(app)

    // set up app destroyed handler
    // https://github.com/vuejs/vue-router/issues/2639
    app.$once('hook:destroyed', () => {
      // clean out app from this.apps array once destroyed
      const index = this.apps.indexOf(app)
      if (index > -1) this.apps.splice(index, 1)
      // ensure we still have a main app or null if no apps
      // we do not release the router so it can be reused
      if (this.app === app) this.app = this.apps[0] || null

      if (!this.app) this.history.teardown()
    })

    // main app previously initialized
    // return as we don't need to set up new history listener
    // 保证VueRouter只初始化一次，如果初始化了就终止后续逻辑
    if (this.app) {
      return
    }
    // 将vue实例挂载到vueRouter上，router挂载到Vue实例上
    this.app = app
    // history是vueRouter维护的全局变量，很重要
    const history = this.history
    // 针对不同路由模式做不同的处理 transitionTo是history的核心方法，
    if (history instanceof HTML5History || history instanceof HashHistory) {
      const handleInitialScroll = routeOrError => {
        const from = history.current
        const expectScroll = this.options.scrollBehavior
        const supportsScroll = supportsPushState && expectScroll

        if (supportsScroll && 'fullPath' in routeOrError) {
          handleScroll(this, routeOrError, from, false)
        }
      }
      const setupListeners = routeOrError => {
        history.setupListeners()
        handleInitialScroll(routeOrError)
      }
      history.transitionTo(
        history.getCurrentLocation(),
        setupListeners,
        setupListeners
      )
    }
    // 路由全局监听，维护当前的route
    // 因为_route在install执行时定义为响应式属性，
    // 当route变更时_route更新，后面的视图更新渲染就是依赖于_route
    history.listen(route => {
      this.apps.forEach(app => {
        app._route = route
      })
    })
  }
  // 路由跳转之前
  beforeEach(fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }
  // 路由导航被确认之间前
  beforeResolve(fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }
  // 路由跳转之后
  afterEach(fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }
  // 第一次路由跳转完成时被调用的回调函数
  onReady(cb: Function, errorCb?: Function) {
    this.history.onReady(cb, errorCb)
  }
  // 路由报错
  onError(errorCb: Function) {
    this.history.onError(errorCb)
  }
  // 路由添加，这个方法会向history栈添加一个记录，点击后退会返回到上一个页面。
  push(location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.push(location, resolve, reject)
      })
    } else {
      this.history.push(location, onComplete, onAbort)
    }
  }
  // 这个方法不会向history里面添加新的记录，点击返回，会跳转到上上一个页面。上一个记录是不存在的。
  replace(location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.replace(location, resolve, reject)
      })
    } else {
      this.history.replace(location, onComplete, onAbort)
    }
  }
  // 相对于当前页面向前或向后跳转多少个页面,类似 window.history.go(n)。n可为正数可为负数。正数返回上一个页面
  go(n: number) {
    this.history.go(n)
  }
  // 后退到上一个页面
  back() {
    this.go(-1)
  }
  // 前进到下一个页面
  forward() {
    this.go(1)
  }

  // 获取匹配到的路由组件
  getMatchedComponents(to?: RawLocation | Route): Array<any> {
    const route: any = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute
    if (!route) {
      return []
    }
    return [].concat.apply(
      [],
      route.matched.map(m => {
        return Object.keys(m.components).map(key => {
          return m.components[key]
        })
      })
    )
  }

  resolve(
    to: RawLocation,
    current?: Route,
    append?: boolean
  ): {
    location: Location,
    route: Route,
    href: string,
    // for backwards compat
    normalizedTo: Location,
    resolved: Route
  } {
    current = current || this.history.current
    const location = normalizeLocation(to, current, append, this)
    const route = this.match(location, current)
    const fullPath = route.redirectedFrom || route.fullPath
    const base = this.history.base
    const href = createHref(base, fullPath, this.mode)
    return {
      location,
      route,
      href,
      // for backwards compat
      normalizedTo: location,
      resolved: route
    }
  }
  // 动态添加路由
  addRoutes(routes: Array<RouteConfig>) {
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}

function registerHook(list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}

function createHref(base: string, fullPath: string, mode) {
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  return base ? cleanPath(base + '/' + path) : path
}

// 给VueRouter.install 赋值
VueRouter.install = install
VueRouter.version = '__VERSION__'
VueRouter.isNavigationFailure = isNavigationFailure
VueRouter.NavigationFailureType = NavigationFailureType

// 以链接的形式引入vue-router插件 直接注册vue-router
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
