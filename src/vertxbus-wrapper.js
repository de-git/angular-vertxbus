angular.module('knalli.angular-vertxbus')
.provider('vertxEventBus', function () {

  // global constants
  const CONSTANTS = {
    MODULE: 'angular-vertxbus',
    COMPONENT: 'wrapper'
  }

  // default options for this module: TODO doc
  const DEFAULT_OPTIONS = {
    enabled: true,
    debugEnabled: false,
    prefix: 'vertx-eventbus.',
    urlServer: `${location.protocol}//${location.hostname}` + ((() => {if (location.port) { return `:${location.port}` }})() || ''),
    urlPath: '/eventbus',
    reconnectEnabled: true,
    sockjsStateInterval: 10000,
    sockjsReconnectInterval: 10000,
    sockjsOptions: {},
    messageBuffer: 0
  }

  // options (globally, application-wide)
  var options = angular.extend({}, DEFAULT_OPTIONS)

  this.enable = (value = DEFAULT_OPTIONS.enabled) => {
    options.enabled = (value === true)
    return this
  }
  this.enable.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: provider.enable`

  this.useDebug = (value = DEFAULT_OPTIONS.debugEnabled) => {
    options.debugEnabled = (value === true)
    return this
  }
  this.useDebug.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: provider.useDebug`

  this.usePrefix = (value = DEFAULT_OPTIONS.prefix) => {
    options.prefix = value
    return this
  }
  this.usePrefix.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: provider.usePrefix`

  this.useUrlServer = (value = DEFAULT_OPTIONS.urlServer) => {
    options.urlServer = value
    return this
  }
  this.useUrlServer.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: provider.useUrlServer`

  this.useUrlPath = (value = DEFAULT_OPTIONS.urlPath) => {
    options.urlPath = value
    return this
  }
  this.useUrlPath.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: provider.useUrlPath`

  this.useReconnect = (value = DEFAULT_OPTIONS.reconnectEnabled) => {
    options.reconnectEnabled = value
    return this
  }
  this.useReconnect.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: provider.useReconnect`

  this.useSockJsStateInterval = (value = DEFAULT_OPTIONS.sockjsStateInterval) => {
    options.sockjsStateInterval = value
    return this
  }
  this.useSockJsStateInterval.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: provider.useSockJsStateInterval`

  this.useSockJsReconnectInterval = (value = DEFAULT_OPTIONS.sockjsReconnectInterval) => {
    options.sockjsReconnectInterval = value
    return this
  }
  this.useSockJsReconnectInterval.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: provider.useSockJsReconnectInterval`

  this.useSockJsOptions = (value = DEFAULT_OPTIONS.sockjsOptions) => {
    options.sockjsOptions = value
    return this
  }
  this.useSockJsOptions.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: provider.useSockJsOptions`

  this.useMessageBuffer = (value = DEFAULT_OPTIONS.messageBuffer) => {
    options.messageBuffer = value
    return this
  }
  this.useMessageBuffer.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: provider.useMessageBuffer`

  /*
    A stub representing the VertX Event Bus (core functionality)

    Because the Event Bus cannot handle a reconnect (because of the underlaying SockJS), a new instance of the bus have to be created.
    This stub ensures only one object holding the current active instance of the bus.

    The stub supports theses VertX Event Bus APIs:
    - close()
    - login(username, password, replyHandler)
    - send(address, message, handler)
    - publish(address, message)
    - registerHandler(adress, handler)
    - unregisterHandler(address, handler)
    - readyState()

    Furthermore, the stub supports theses extra APIs:
    - recconnect()
  */
  this.$get = ($timeout, $log) => {

    // Current options (merged defaults with application-wide settings)
    var {
      enabled,
      debugEnabled,
      prefix,
      urlServer,
      urlPath,
      reconnectEnabled,
      sockjsStateInterval,
      sockjsReconnectInterval,
      sockjsOptions,
      messageBuffer
    } = angular.extend({}, DEFAULT_OPTIONS, options)

    if (enabled && vertx && vertx.EventBus) {
      if (debugEnabled) {
        $log.debug("[Vert.x EB Stub] Enabled")
      }
      return new ProxyEventbusWrapper(vertx.EventBus, $timeout, $log, {
        enabled,
        debugEnabled,
        prefix,
        urlServer,
        urlPath,
        reconnectEnabled,
        sockjsStateInterval,
        sockjsReconnectInterval,
        sockjsOptions,
        messageBuffer
      })
    } else {
      if (debugEnabled) {
        $log.debug("[Vert.x EB Stub] Disabled")
      }
      return new SentinelEventbusWrapper()
    }
  } // $get


  class EventbusWrapper {

    constructor() {}

    connect() {}

    reconnect() {}

    close() {}

    login(username, password, replyHandler) {}

    send(address, message, replyHandler) {}

    publish(address, message) {  }

    registerHandler(address, handler) {  }

    unregisterHandler(address, handler) {}

    readyState() {}

    getOptions() {
      return {}
    }

    // empty: can be overriden by externals
    onopen() {}

    // empty: can be overriden by externals
    onclose() {}

  }

  class ProxyEventbusWrapper extends EventbusWrapper {

    constructor(EventBus, $timeout, $log, {
      enabled,
      debugEnabled,
      prefix,
      urlServer,
      urlPath,
      reconnectEnabled,
      sockjsStateInterval,
      sockjsReconnectInterval,
      sockjsOptions,
      messageBuffer
    }) {
      super()
       // actual EventBus type
      this.EventBus = EventBus
      this.$timeout = $timeout
      this.$log = $log
      this.options = {
        enabled,
        debugEnabled,
        prefix,
        urlServer,
        urlPath,
        reconnectEnabled,
        sockjsStateInterval,
        sockjsReconnectInterval,
        sockjsOptions,
        messageBuffer
      }
      // asap create connection
      this.connect()
    }

    connect() {
      let url = `${this.options.urlServer}${this.options.urlPath}`
      if (this.options.debugEnabled) {
        this.$log.debug(`[Vert.x EB Stub] Enabled: connecting '${url}'`)
      }
      // Because we have rebuild an EventBus object (because it have to rebuild a SockJS object)
      // we must wrap the object. Therefore, we have to mimic the behavior of onopen and onclose each time.
      this.instance = new this.EventBus(url, undefined, this.options.sockjsOptions)
      this.instance.onopen = () => {
        if (this.options.debugEnabled) {
          this.$log.debug("[Vert.x EB Stub] Connected")
        }
        if (angular.isFunction(this.onopen)) {
          this.onopen()
        }
      }
      this.instance.onclose = () => {
        if (this.options.debugEnabled) {
          this.$log.debug(`[Vert.x EB Stub] Reconnect in ${this.options.sockjsReconnectInterval}ms`)
        }
        if (angular.isFunction(this.onclose)) {
          this.onclose()
        }
        this.instance = undefined
        if (this.options.reconnectEnabled) {
          this.$timeout((() => this.connect()), this.options.sockjsReconnectInterval)
        }
      }
    }

    reconnect() {
      if (this.instance) {
        return this.instance.close()
      }
    }

    close() {
      if (this.instance) {
        return this.instance.close()
      }
    }

    login(username, password, replyHandler) {
      if (this.instance) {
        return this.instance.login(username, password, replyHandler)
      }
    }

    send(address, message, replyHandler) {
      if (this.instance) {
        return this.instance.send(address, message, replyHandler)
      }
    }

    publish(address, message) {
      if (this.instance) {
        return this.instance.publish(address, message)
      }
    }

    registerHandler(address, handler) {
      if (this.instance) {
        this.instance.registerHandler(address, handler)
        // and return the deregister callback
        let deconstructor = () => {
          this.unregisterHandler(address, handler)
        }
        deconstructor.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: EventBusStub.registerHandler (deconstructor)`
        return deconstructor
      }
    }

    unregisterHandler(address, handler) {
      if (this.instance) {
        return this.instance.unregisterHandler(address, handler)
      }
    }

    readyState() {
      if (this.instance) {
        return this.instance.readyState()
      } else {
        return this.EventBus.CLOSED;
      }
    }

    getOptions() {
      // clone options
      return angular.extend({}, this.options)
    }
  }

  class SentinelEventbusWrapper extends EventbusWrapper {}

})
