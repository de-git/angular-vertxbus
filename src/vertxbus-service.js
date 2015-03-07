angular.module('knalli.angular-vertxbus')
.provider('vertxEventBusService', function () {

  const CONSTANTS = {
    MODULE: 'angular-vertxbus',
    COMPONENT: 'service'
  }

  const DEFAULT_OPTIONS = {
    loginRequired: false
  }

  /*
    Simple queue implementation

    FIFO: #push() + #first()
    LIFO: #push() + #last()
  */
  class Queue {

    constructor(maxSize = 10) {
      this.maxSize = maxSize
      this.items = []
    }

    push(item) {
      this.items.push(item)
      return this.recalibrateBufferSize()
    }

    recalibrateBufferSize() {
      while (this.items.length > this.maxSize) {
        this.first()
      }
      return this
    }

    last() {
      return this.items.pop()
    }

    first() {
      return this.items.shift(0)
    }

    size() {
      return this.items.length
    }

  }

  /*
    Simple Map implementation

    This implementation allows usage of non serializable keys for values.
  */
  class SimpleMap {

    constructor() {
      this.clear()
    }

    // Stores the value under the key.
    // Chainable
    put(key, value) {
      var idx = this._indexForKey(key)
      if (idx > -1) {
        this.values[idx] = value
      } else {
        this.keys.push(key)
        this.values.push(value)
      }
      return this
    }

    // Returns value for key, otherwise undefined.
    get(key) {
      var idx = this._indexForKey(key)
      if (idx > -1) {
        return this.values[idx]
      }
      return
    }

    // Returns true if the key exists.
    containsKey(key) {
      let idx = this._indexForKey(key)
      return idx > -1
    }

    // Returns true if the value exists.
    containsValue(value) {
      let idx = this._indexForValue(value)
      return idx > -1
    }

    // Removes the key and its value.
    remove(key) {
      let idx = this._indexForKey(key)
      if (idx > -1) {
        this.keys[idx] = undefined
        this.values[idx] = undefined
      }
      return
    }

    // Clears all keys and values.
    clear() {
      this.keys = []
      this.values = []
      return this
    }

    // Returns index of key, otherwise -1.
    _indexForKey(key) {
      for (let i in this.keys) {
        if (key === this.keys[i]) {
          return i
        }
      }
      return -1
    }

    _indexForValue(value) {
      for (let i in this.values) {
        if (value === this.values[i]) {
          return i
        }
      }
      return -1
    }

  }

  // options (globally, application-wide)
  var options = angular.extend({}, DEFAULT_OPTIONS)

  this.requireLogin = (value = options.loginRequired) => {
    options.loginRequired = (value === true)
    return this
  }
  this.requireLogin.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: provider.requireLogin`

  this.$get = ($rootScope, $q, $interval, vertxEventBus, $log) => {
    let {
      enabled,
      debugEnabled,
      prefix,
      urlServer,
      urlPath,
      reconnectEnabled,
      sockjsStateInterval,
      sockjsReconnectInterval,
      sockjsOptions,
      messageBuffer,
      loginRequired
    } = angular.extend({}, vertxEventBus.getOptions(), options)
    if (enabled) {
      let service = new LiveEventbusService($rootScope, $interval, $log, $q, vertxEventBus, {
        enabled,
        debugEnabled,
        prefix,
        urlServer,
        urlPath,
        reconnectEnabled,
        sockjsStateInterval,
        sockjsReconnectInterval,
        sockjsOptions,
        messageBuffer,
        loginRequired
      })
      return new InterfaceService(service)
    } else {
      return new InterfaceService(new SentinelEventbusService())
    }
  } // $get


  class EventbusService {

    isConnectionOpen() {
      return false
    }

    get validSession() {
      return false
    }

    set validSession(validSession) {}

  }

  class LiveEventbusService extends EventbusService {
    constructor($rootScope, $interval, $log, $q, eventBus, {
      enabled,
      debugEnabled,
      prefix,
      urlServer,
      urlPath,
      reconnectEnabled,
      sockjsStateInterval,
      sockjsReconnectInterval,
      sockjsOptions,
      messageBuffer,
      loginRequired
    }) {
      this.$rootScope = $rootScope
      this.$interval = $interval
      this.$log = $log
      this.$q = $q
      this.eventBus = eventBus
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
        messageBuffer,
        loginRequired
      }
      this.connectionState = this.eventBus.EventBus.CLOSED
      this.states = {
        connected: false,
        validSession: false
      }
      this.observers = []
      // internal store of buffered messages
      this.messageQueue = new Queue(this.options.messageBuffer)
      // internal map of callbacks
      this.callbackMap = new SimpleMap()
      // asap
      this.initialize()
    }

    initialize() {
      this.eventBus.onopen = () => this.onEventbusOpen()
      this.eventBus.onclose = () => this.onEventbusClose()

      // Update the current connection state periodially.
      let connectionIntervalCheck = () => this.getConnectionState(true)
      connectionIntervalCheck.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: periodic connection check`
      this.$interval((() => connectionIntervalCheck()), this.options.sockjsStateInterval)
    }

    onEventbusOpen() {
      this.getConnectionState(true)
      if (!this.connected) {
        this.connected = true
        this.$rootScope.$broadcast(`${this.options.prefix}system.connected`)
      }
      this.afterEventbusConnected()
      this.$rootScope.$digest()
      // consume message queue?
      if (this.options.messageBuffer && this.messageQueue.size()) {
        while (this.messageQueue.size()) {
          let fn = this.messageQueue.first()
          if (angular.isFunction(fn)) {
            fn()
          }
        }
        this.$rootScope.$digest()
      }
    }

    onEventbusClose() {
      this.getConnectionState(true)
      if (this.connected) {
        this.connected = false
        this.$rootScope.$broadcast(`${this.options.prefix}system.disconnected`)
      }
    }

    observe(observer) {
      this.observers.push(observer)
    }

    afterEventbusConnected() {
      for (let observer of this.observers) {
        if (angular.isFunction(observer.afterEventbusConnected)) {
          observer.afterEventbusConnected();
        }
      }
    }

    // Register a callback handler for the specified address match.
    registerHandler(address, callback) {
      if (!angular.isFunction(callback)) {
        return
      }
      if (this.options.debugEnabled) {
        this.$log.debug(`[Vert.x EB Service] Register handler for ${address}`)
      }
      var callbackWrapper = (message, replyTo) => {
        callback(message, replyTo)
        this.$rootScope.$digest()
      }
      callbackWrapper.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: util.registerHandler (callback wrapper)`
      this.callbackMap.put(callback, callbackWrapper)
      return this.eventBus.registerHandler(address, callbackWrapper)
    }

    // Remove a callback handler for the specified address match.
    unregisterHandler(address, callback) {
      if (!angular.isFunction(callback)) {
        return
      }
      if (this.options.debugEnabled) {
        this.$log.debug(`[Vert.x EB Service] Unregister handler for ${address}`)
      }
      this.eventBus.unregisterHandler(address, this.callbackMap.get(callback))
      this.callbackMap.remove(callback)
    }
    // Send a message to the specified address (using EventBus.send).
    // @param address a required string for the targeting address in the bus
    // @param message a required piece of message data
    // @param timeout an optional number for a timout after which the promise will be rejected
    send(address, message, timeout = 10000) {
      let deferred = this.$q.defer()
      let next = () => {
        this.eventBus.send(address, message, (reply) => {
          deferred.resolve(reply)
        })
        // Register timeout for promise rejecting
        this.$interval((() => deferred.reject()), timeout, 1)
      }
      next.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: util.send (ensureOpenAuthConnection callback)`
      if (!this.ensureOpenAuthConnection(next)) {
        deferred.reject()
      }
      return deferred.promise
    }
    // Publish a message to the specified address (using EventBus.publish).
    // @param address a required string for the targeting address in the bus
    // @param message a required piece of message data
    publish(address, message) {
      let next = () => {
        this.eventBus.publish(address, message)
      }
      next.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: util.publish (ensureOpenAuthConnection callback)`
      return this.ensureOpenAuthConnection(next)
    }
    // Send a login message
    // @param username
    // @param password
    // @param timeout
    login(username = this.options.username, password = this.options.password, timeout = 5000) {
      let deferred = this.$q.defer()
      let next = (reply) => {
        if (reply && reply.status === 'ok') {
          this.validSession = true
          deferred.resolve(reply)
          this.$rootScope.$broadcast(`${this.options.prefix}system.login.succeeded`, {status: reply.status})
        } else {
          this.validSession = false
          deferred.reject(reply)
          this.$rootScope.$broadcast(`${this.options.prefix}system.login.failed`, {status: reply.status})
        }
      }
      next.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: util.login (callback)`
      this.eventBus.login(username, password, next)
      this.$interval((() => deferred.reject()), timeout, 1)
      return deferred.promise
    }

    ensureOpenConnection(fn) {
      if (this.isConnectionOpen()) {
        fn()
        return true
      } else if (this.options.messageBuffer) {
        this.messageQueue.push(fn)
        return true
      }
      return false
    }

    ensureOpenAuthConnection(fn) {
      if (!this.options.loginRequired) {
        // easy: no login required
        this.ensureOpenConnection(fn)
      } else {
        let wrapFn = () => {
          if (this.validSession) {
            fn()
            return true
          } else {
            // ignore this message
            if (this.options.debugEnabled) {
              this.$log.debug(`[Vert.x EB Service] Message was not sent because login is required`)
            }
            return false
          }
        }
        wrapFn.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: ensureOpenAuthConnection function wrapper`
        this.ensureOpenConnection(wrapFn)
      }
    }

    getConnectionState(immediate) {
      if (this.options.enabled) {
        if (immediate) {
          this.connectionState = this.eventBus.readyState()
        }
      } else {
        this.connectionState = this.eventBus.EventBus.CLOSED
      }
      return this.connectionState
    }

    isConnectionOpen() {
      return this.getConnectionState() === this.eventBus.EventBus.OPEN
    }

    get validSession() {
      return this.states.validSession
    }
    set validSession(validSession) {
      this.states.validSession = (validSession === true)
    }

    get connected() {
      return this.states.connected
    }
    set connected(connected) {
      this.states.connected = (connected === true)
    }

    get messageQueueLength() {
      return this.messageQueue.size()
    }
  }


  class SentinelEventbusService extends EventbusService {}


  class InterfaceService {

    constructor(delegate) {
      this.delegate = delegate
      this.handlers = []
      this.delegate.observe({
        afterEventbusConnected: () => this.afterEventbusConnected()
      })
    }

    afterEventbusConnected() {
      for (let address in this.handlers) {
        let callbacks = this.handlers[address]
        if (callbacks && callbacks.length) {
          for (let callback of callbacks) {
            this.delegate.registerHandler(address, callback)
          }
        }
      }
    }

    registerHandler(address, callback) {
      if (!this.handlers[address]) {
        this.handlers[address] = []
      }
      this.handlers[address].push(callback)
      var unregisterFn = null
      if (this.delegate.isConnectionOpen()) {
        unregisterFn = this.delegate.registerHandler(address, callback)
      }
      // and return the deregister callback
      var deconstructor = () => {
        if (unregisterFn) {
          unregisterFn()
        }
        // Remove from internal map
        if (this.handlers[address]) {
          var index = this.handlers[address].indexOf(callback)
          if (index > -1) {
            this.handlers[address].splice(index, 1)
          }
        }
        if (this.handlers[address].length < 1) {
          this.handlers[address] = undefined
        }
      }
      deconstructor.displayName = `${CONSTANTS.MODULE}/${CONSTANTS.COMPONENT}: registerHandler (deconstructor)`
      return deconstructor
    }
    on(address, callback) {
      return this.registerHandler(address, callback)
    }
    addListener(address, callback) {
      return this.registerHandler(address, callback)
    }

    unregisterHandler(address, callback) {
      // Remove from internal map
      if (this.handlers[address]) {
        var index = this.handlers[address].indexOf(callback)
        if (index > -1) {
          this.handlers[address].splice(index, 1)
        }
      }
      if (this.handlers[address].length < 1) {
        this.handlers[address] = undefined
      }
      // Remove from real instance
      if (this.delegate.isConnectionOpen()) {
        this.delegate.unregisterHandler(address, callback)
      }
    }
    un(address, callback) {
      return this.unregisterHandler(address, callback)
    }
    removeListener(address, callback) {
      return this.unregisterHandler(address, callback)
    }

    send(address, message, timeout = 10000) {
      return this.delegate.send(address, message, timeout)
    }

    publish(address, message) {
      return this.delegate.publish(address, message)
    }
    emit(address, message) {
      return this.publish(address, message)
    }

    getConnectionState() {
      return this.delegate.getConnectionState()
    }
    readyState() {
      return this.getConnectionState()
    }

    isEnabled() {
      return this.enabled
    }

    login(username, password, timeout) {
      return this.delegate.login(username, password, timeout)
    }

  }

})
