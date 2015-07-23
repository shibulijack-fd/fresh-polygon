// jquery.pjax.js
// copyright chris wanstrath
// https://github.com/defunkt/jquery-pjax
(function($){
(function($){

// When called on a container with a selector, fetches the href with
// ajax into the container or with the data-pjax attribute on the link
// itself.
//
// Tries to make sure the back button and ctrl+click work the way
// you'd expect.
//
// Exported as $.fn.pjax
//
// Accepts a jQuery ajax options object that may include these
// pjax specific options:
//
//
// container - Where to stick the response body. Usually a String selector.
//             $(container).html(xhr.responseBody)
//             (default: current jquery context)
//      push - Whether to pushState the URL. Defaults to true (of course).
//   replace - Want to use replaceState instead? That's cool.
//
// For convenience the second parameter can be either the container or
// the options object.
//
// Returns the jQuery object
function fnPjax(selector, container, options) {
  var context = this
  return this.on('click.pjax', selector, function(event) {
    var opts = $.extend({}, optionsFor(container, options))
    if (!opts.container)
      opts.container = $(this).attr('data-pjax') || context
    handleClick(event, opts)
  })
}

// Public: pjax on click handler
//
// Exported as $.pjax.click.
//
// event   - "click" jQuery.Event
// options - pjax options
//
// Examples
//
//   $(document).on('click', 'a', $.pjax.click)
//   // is the same as
//   $(document).pjax('a')
//
//  $(document).on('click', 'a', function(event) {
//    var container = $(this).closest('[data-pjax-container]')
//    $.pjax.click(event, container)
//  })
//
// Returns nothing.
function handleClick(event, container, options) {
  options = optionsFor(container, options)

  var link = event.currentTarget

  if (link.tagName.toUpperCase() !== 'A')
    throw "$.fn.pjax or $.pjax.click requires an anchor element"

  // Middle click, cmd click, and ctrl click should open
  // links in a new tab as normal.
  if ( event.which > 1 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey )
    return

  // Ignore cross origin links
  if ( location.protocol !== link.protocol || location.hostname !== link.hostname )
    return

  // Ignore anchors on the same page
  if (link.hash && link.href.replace(link.hash, '') ===
       location.href.replace(location.hash, ''))
    return

  // Ignore empty anchor "foo.html#"
  if (link.href === location.href + '#')
    return

  // Ignore event with default prevented
  if (event.isDefaultPrevented())
    return

  var defaults = {
    url: link.href,
    container: $(link).attr('data-pjax'),
    target: link
  }

  var opts = $.extend({}, defaults, options)
  var clickEvent = $.Event('pjax:click')
  $(link).trigger(clickEvent, [opts])

  if (!clickEvent.isDefaultPrevented()) {
    pjax(opts)
    event.preventDefault()
    $(link).trigger('pjax:clicked', [opts])
  }
}

// Public: pjax on form submit handler
//
// Exported as $.pjax.submit
//
// event   - "click" jQuery.Event
// options - pjax options
//
// Examples
//
//  $(document).on('submit', 'form', function(event) {
//    var container = $(this).closest('[data-pjax-container]')
//    $.pjax.submit(event, container)
//  })
//
// Returns nothing.
function handleSubmit(event, container, options) {
  options = optionsFor(container, options)

  var form = event.currentTarget

  if (form.tagName.toUpperCase() !== 'FORM')
    throw "$.pjax.submit requires a form element"

  var defaults = {
    type: form.method.toUpperCase(),
    url: form.action,
    data: $(form).serializeArray(),
    container: $(form).attr('data-pjax'),
    target: form
  }

  pjax($.extend({}, defaults, options))

  event.preventDefault()
}

// Loads a URL with ajax, puts the response body inside a container,
// then pushState()'s the loaded URL.
//
// Works just like $.ajax in that it accepts a jQuery ajax
// settings object (with keys like url, type, data, etc).
//
// Accepts these extra keys:
//
// container - Where to stick the response body.
//             $(container).html(xhr.responseBody)
//      push - Whether to pushState the URL. Defaults to true (of course).
//   replace - Want to use replaceState instead? That's cool.
//
// Use it just like $.ajax:
//
//   var xhr = $.pjax({ url: this.href, container: '#main' })
//   console.log( xhr.readyState )
//
// Returns whatever $.ajax returns.
function pjax(options) {
  options = $.extend(true, {}, $.ajaxSettings, pjax.defaults, options)

  if ($.isFunction(options.url)) {
    options.url = options.url()
  }

  var target = options.target

  var hash = parseURL(options.url).hash

  var context = options.context = findContainerFor(options.container)

  // We want the browser to maintain two separate internal caches: one
  // for pjax'd partial page loads and one for normal page loads.
  // Without adding this secret parameter, some browsers will often
  // confuse the two.
  if (!options.data) options.data = {}
  options.data._pjax = context.selector

  function fire(type, args, props) {
    if (!props) props = {}
    props.relatedTarget = target
    var event = $.Event(type, props)
    context.trigger(event, args)
    return !event.isDefaultPrevented()
  }

  var timeoutTimer

  options.beforeSend = function(xhr, settings) {
    // No timeout for non-GET requests
    // Its not safe to request the resource again with a fallback method.
    if (settings.type !== 'GET') {
      settings.timeout = 0
    }

    xhr.setRequestHeader('X-PJAX', 'true')
    xhr.setRequestHeader('X-PJAX-Container', context.selector)

    if (!fire('pjax:beforeSend', [xhr, settings]))
      return false

    if (settings.timeout > 0) {
      timeoutTimer = setTimeout(function() {
        if (fire('pjax:timeout', [xhr, options]))
          xhr.abort('timeout')
      }, settings.timeout)

      // Clear timeout setting so jquerys internal timeout isn't invoked
      settings.timeout = 0
    }

    options.requestUrl = parseURL(settings.url).href
  }

  options.complete = function(xhr, textStatus) {
    if (timeoutTimer)
      clearTimeout(timeoutTimer)

    fire('pjax:complete', [xhr, textStatus, options])

    fire('pjax:end', [xhr, options])
  }

  options.error = function(xhr, textStatus, errorThrown) {
    var container = extractContainer("", xhr, options)

    var allowed = fire('pjax:error', [xhr, textStatus, errorThrown, options])
    if (options.type == 'GET' && textStatus !== 'abort' && allowed) {
      locationReplace(container.url)
    }
  }

  options.success = function(data, status, xhr) {
    var previousState = pjax.state;

    // If $.pjax.defaults.version is a function, invoke it first.
    // Otherwise it can be a static string.
    var currentVersion = (typeof $.pjax.defaults.version === 'function') ?
      $.pjax.defaults.version() :
      $.pjax.defaults.version

    var latestVersion = xhr.getResponseHeader('X-PJAX-Version')

    var container = extractContainer(data, xhr, options)

    // If there is a layout version mismatch, hard load the new url
    if (currentVersion && latestVersion && currentVersion !== latestVersion) {
      locationReplace(container.url)
      return
    }

    // If the new response is missing a body, hard load the page
    if (!container.contents) {
      locationReplace(container.url)
      return
    }

    pjax.state = {
      id: options.id || uniqueId(),
      url: container.url,
      title: container.title,
      container: context.selector,
      fragment: options.fragment,
      timeout: options.timeout
    }

    if (options.push || options.replace) {
      window.history.replaceState(pjax.state, container.title, container.url)
    }

    // Clear out any focused controls before inserting new page contents.
    try {
      document.activeElement.blur()
    } catch (e) { }

    if (container.title) document.title = container.title

    fire('pjax:beforeReplace', [container.contents, options], {
      state: pjax.state,
      previousState: previousState
    })
    context.html(container.contents)

    // FF bug: Won't autofocus fields that are inserted via JS.
    // This behavior is incorrect. So if theres no current focus, autofocus
    // the last field.
    //
    // http://www.w3.org/html/wg/drafts/html/master/forms.html
    var autofocusEl = context.find('input[autofocus], textarea[autofocus]').last()[0]
    if (autofocusEl && document.activeElement !== autofocusEl) {
      autofocusEl.focus();
    }

    executeScriptTags(container.scripts)

    // Scroll to top by default
    if (typeof options.scrollTo === 'number')
      $(window).scrollTop(options.scrollTo)

    // If the URL has a hash in it, make sure the browser
    // knows to navigate to the hash.
    if ( hash !== '' ) {
      // Avoid using simple hash set here. Will add another history
      // entry. Replace the url with replaceState and scroll to target
      // by hand.
      //
      //   window.location.hash = hash
      var url = parseURL(container.url)
      url.hash = hash

      pjax.state.url = url.href
      window.history.replaceState(pjax.state, container.title, url.href)

      var target = $(url.hash)
      if (target.length) $(window).scrollTop(target.offset().top)
    }

    fire('pjax:success', [data, status, xhr, options])
  }


  // Initialize pjax.state for the initial page load. Assume we're
  // using the container and options of the link we're loading for the
  // back button to the initial page. This ensures good back button
  // behavior.
  if (!pjax.state) {
    pjax.state = {
      id: uniqueId(),
      url: window.location.href,
      title: document.title,
      container: context.selector,
      fragment: options.fragment,
      timeout: options.timeout
    }
    window.history.replaceState(pjax.state, document.title)
  }

  // Cancel the current request if we're already pjaxing
  var xhr = pjax.xhr
  if ( xhr && xhr.readyState < 4) {
    xhr.onreadystatechange = $.noop
    xhr.abort()
  }

  pjax.options = options
  var xhr = pjax.xhr = $.ajax(options)

  if (xhr.readyState > 0) {
    if (options.push && !options.replace) {
      // Cache current container element before replacing it
      cachePush(pjax.state.id, context.clone().contents())

      window.history.pushState(null, "", stripPjaxParam(options.requestUrl))
    }

    fire('pjax:start', [xhr, options])
    fire('pjax:send', [xhr, options])
  }

  return pjax.xhr
}

// Public: Reload current page with pjax.
//
// Returns whatever $.pjax returns.
function pjaxReload(container, options) {
  var defaults = {
    url: window.location.href,
    push: false,
    replace: true,
    scrollTo: false
  }

  return pjax($.extend(defaults, optionsFor(container, options)))
}

// Internal: Hard replace current state with url.
//
// Work for around WebKit
//   https://bugs.webkit.org/show_bug.cgi?id=93506
//
// Returns nothing.
function locationReplace(url) {
  window.history.replaceState(null, "", "#")
  window.location.replace(url)
}


var initialPop = true
var initialURL = window.location.href
var initialState = window.history.state

// Initialize $.pjax.state if possible
// Happens when reloading a page and coming forward from a different
// session history.
if (initialState && initialState.container) {
  pjax.state = initialState
}

// Non-webkit browsers don't fire an initial popstate event
if ('state' in window.history) {
  initialPop = false
}

// popstate handler takes care of the back and forward buttons
//
// You probably shouldn't use pjax on pages with other pushState
// stuff yet.
function onPjaxPopstate(event) {
  var previousState = pjax.state;
  var state = event.state

  if (state && state.container) {
    // When coming forward from a separate history session, will get an
    // initial pop with a state we are already at. Skip reloading the current
    // page.
    if (initialPop && initialURL == state.url) return

    // If popping back to the same state, just skip.
    // Could be clicking back from hashchange rather than a pushState.
    if (pjax.state && pjax.state.id === state.id) return

    var container = $(state.container)
    if (container.length) {
      var direction, contents = cacheMapping[state.id]

      if (pjax.state) {
        // Since state ids always increase, we can deduce the history
        // direction from the previous state.
        direction = pjax.state.id < state.id ? 'forward' : 'back'

        // Cache current container before replacement and inform the
        // cache which direction the history shifted.
        cachePop(direction, pjax.state.id, container.clone().contents())
      }

      var popstateEvent = $.Event('pjax:popstate', {
        state: state,
        direction: direction
      })
      container.trigger(popstateEvent)

      var options = {
        id: state.id,
        url: state.url,
        container: container,
        push: false,
        fragment: state.fragment,
        timeout: state.timeout,
        scrollTo: false
      }

      if (contents) {
        container.trigger('pjax:start', [null, options])

        pjax.state = state
        if (state.title) document.title = state.title
        var beforeReplaceEvent = $.Event('pjax:beforeReplace', {
          state: state,
          previousState: previousState
        })
        container.trigger(beforeReplaceEvent, [contents, options])
        container.html(contents)

        container.trigger('pjax:end', [null, options])
      } else {
        pjax(options)
      }

      // Force reflow/relayout before the browser tries to restore the
      // scroll position.
      container[0].offsetHeight
    } else {
      locationReplace(location.href)
    }
  }
  initialPop = false
}

// Fallback version of main pjax function for browsers that don't
// support pushState.
//
// Returns nothing since it retriggers a hard form submission.
function fallbackPjax(options) {
  var url = $.isFunction(options.url) ? options.url() : options.url,
      method = options.type ? options.type.toUpperCase() : 'GET'

  var form = $('<form>', {
    method: method === 'GET' ? 'GET' : 'POST',
    action: url,
    style: 'display:none'
  })

  if (method !== 'GET' && method !== 'POST') {
    form.append($('<input>', {
      type: 'hidden',
      name: '_method',
      value: method.toLowerCase()
    }))
  }

  var data = options.data
  if (typeof data === 'string') {
    $.each(data.split('&'), function(index, value) {
      var pair = value.split('=')
      form.append($('<input>', {type: 'hidden', name: pair[0], value: pair[1]}))
    })
  } else if (typeof data === 'object') {
    for (key in data)
      form.append($('<input>', {type: 'hidden', name: key, value: data[key]}))
  }

  $(document.body).append(form)
  form.submit()
}

// Internal: Generate unique id for state object.
//
// Use a timestamp instead of a counter since ids should still be
// unique across page loads.
//
// Returns Number.
function uniqueId() {
  return (new Date).getTime()
}

// Internal: Strips _pjax param from url
//
// url - String
//
// Returns String.
function stripPjaxParam(url) {
  return url
    .replace(/\?_pjax=[^&]+&?/, '?')
    .replace(/_pjax=[^&]+&?/, '')
    .replace(/[\?&]$/, '')
}

// Internal: Parse URL components and returns a Locationish object.
//
// url - String URL
//
// Returns HTMLAnchorElement that acts like Location.
function parseURL(url) {
  var a = document.createElement('a')
  a.href = url
  return a
}

// Internal: Build options Object for arguments.
//
// For convenience the first parameter can be either the container or
// the options object.
//
// Examples
//
//   optionsFor('#container')
//   // => {container: '#container'}
//
//   optionsFor('#container', {push: true})
//   // => {container: '#container', push: true}
//
//   optionsFor({container: '#container', push: true})
//   // => {container: '#container', push: true}
//
// Returns options Object.
function optionsFor(container, options) {
  // Both container and options
  if ( container && options )
    options.container = container

  // First argument is options Object
  else if ( $.isPlainObject(container) )
    options = container

  // Only container
  else
    options = {container: container}

  // Find and validate container
  if (options.container)
    options.container = findContainerFor(options.container)

  return options
}

// Internal: Find container element for a variety of inputs.
//
// Because we can't persist elements using the history API, we must be
// able to find a String selector that will consistently find the Element.
//
// container - A selector String, jQuery object, or DOM Element.
//
// Returns a jQuery object whose context is `document` and has a selector.
function findContainerFor(container) {
  container = $(container)

  if ( !container.length ) {
    throw "no pjax container for " + container.selector
  } else if ( container.selector !== '' && container.context === document ) {
    return container
  } else if ( container.attr('id') ) {
    return $('#' + container.attr('id'))
  } else {
    throw "cant get selector for pjax container!"
  }
}

// Internal: Filter and find all elements matching the selector.
//
// Where $.fn.find only matches descendants, findAll will test all the
// top level elements in the jQuery object as well.
//
// elems    - jQuery object of Elements
// selector - String selector to match
//
// Returns a jQuery object.
function findAll(elems, selector) {
  return elems.filter(selector).add(elems.find(selector));
}

function parseHTML(html) {
  return $.parseHTML(html, document, true)
}

// Internal: Extracts container and metadata from response.
//
// 1. Extracts X-PJAX-URL header if set
// 2. Extracts inline <title> tags
// 3. Builds response Element and extracts fragment if set
//
// data    - String response data
// xhr     - XHR response
// options - pjax options Object
//
// Returns an Object with url, title, and contents keys.
function extractContainer(data, xhr, options) {
  var obj = {}

  // Prefer X-PJAX-URL header if it was set, otherwise fallback to
  // using the original requested url.
  obj.url = stripPjaxParam(xhr.getResponseHeader('X-PJAX-URL') || options.requestUrl)

  // Attempt to parse response html into elements
  if (/<html/i.test(data)) {
    var $head = $(parseHTML(data.match(/<head[^>]*>([\s\S.]*)<\/head>/i)[0]))
    var $body = $(parseHTML(data.match(/<body[^>]*>([\s\S.]*)<\/body>/i)[0]))
  } else {
    var $head = $body = $(parseHTML(data))
  }

  // If response data is empty, return fast
  if ($body.length === 0)
    return obj

  // If there's a <title> tag in the header, use it as
  // the page's title.
  obj.title = findAll($head, 'title').last().text()

  options.fragment = options.fragment || options.context.selector;

  if (options.fragment) {
    // If they specified a fragment, look for it in the response
    // and pull it out.
    if (options.fragment === 'body') {
      var $fragment = $body
    } else {
      var $fragment = findAll($body, options.fragment).first()
    }

    if ($fragment.length) {
      obj.contents = $fragment.contents()

      // If there's no title, look for data-title and title attributes
      // on the fragment
      if (!obj.title)
        obj.title = $fragment.attr('title') || $fragment.data('title')
    }

  } else if (!/<html/i.test(data)) {
    obj.contents = $body
  } else {
    debugger
  }

  // Clean up any <title> tags
  if (obj.contents) {
    // Remove any parent title elements
    obj.contents = obj.contents.not(function() { return $(this).is('title') })

    // Then scrub any titles from their descendants
    obj.contents.find('title').remove()

    // Gather all script[src] elements
    obj.scripts = findAll(obj.contents, 'script[src]').remove()
    obj.contents = obj.contents.not(obj.scripts)
  }

  // Trim any whitespace off the title
  if (obj.title) obj.title = $.trim(obj.title)

  return obj
}

// Load an execute scripts using standard script request.
//
// Avoids jQuery's traditional $.getScript which does a XHR request and
// globalEval.
//
// scripts - jQuery object of script Elements
//
// Returns nothing.
function executeScriptTags(scripts) {
  if (!scripts) return

  var existingScripts = $('script[src]')

  scripts.each(function() {
    var src = this.src
    var matchedScripts = existingScripts.filter(function() {
      return this.src === src
    })
    if (matchedScripts.length) return

    var script = document.createElement('script')
    script.type = $(this).attr('type')
    script.src = $(this).attr('src')
    document.head.appendChild(script)
  })
}

// Internal: History DOM caching class.
var cacheMapping      = {}
var cacheForwardStack = []
var cacheBackStack    = []

// Push previous state id and container contents into the history
// cache. Should be called in conjunction with `pushState` to save the
// previous container contents.
//
// id    - State ID Number
// value - DOM Element to cache
//
// Returns nothing.
function cachePush(id, value) {
  cacheMapping[id] = value
  cacheBackStack.push(id)

  // Remove all entires in forward history stack after pushing
  // a new page.
  while (cacheForwardStack.length)
    delete cacheMapping[cacheForwardStack.shift()]

  // Trim back history stack to max cache length.
  while (cacheBackStack.length > pjax.defaults.maxCacheLength)
    delete cacheMapping[cacheBackStack.shift()]
}

// Shifts cache from directional history cache. Should be
// called on `popstate` with the previous state id and container
// contents.
//
// direction - "forward" or "back" String
// id        - State ID Number
// value     - DOM Element to cache
//
// Returns nothing.
function cachePop(direction, id, value) {
  var pushStack, popStack
  cacheMapping[id] = value

  if (direction === 'forward') {
    pushStack = cacheBackStack
    popStack  = cacheForwardStack
  } else {
    pushStack = cacheForwardStack
    popStack  = cacheBackStack
  }

  pushStack.push(id)
  if (id = popStack.pop())
    delete cacheMapping[id]
}

// Public: Find version identifier for the initial page load.
//
// Returns String version or undefined.
function findVersion() {
  return $('meta').filter(function() {
    var name = $(this).attr('http-equiv')
    return name && name.toUpperCase() === 'X-PJAX-VERSION'
  }).attr('content')
}

// Install pjax functions on $.pjax to enable pushState behavior.
//
// Does nothing if already enabled.
//
// Examples
//
//     $.pjax.enable()
//
// Returns nothing.
function enable() {
  $.fn.pjax = fnPjax
  $.pjax = pjax
  $.pjax.enable = $.noop
  $.pjax.disable = disable
  $.pjax.click = handleClick
  $.pjax.submit = handleSubmit
  $.pjax.reload = pjaxReload
  $.pjax.defaults = {
    timeout: 5650,
    push: true,
    replace: false,
    type: 'GET',
    dataType: 'html',
    scrollTo: 0,
    maxCacheLength: 20,
    version: findVersion
  }
  $(window).on('popstate.pjax', onPjaxPopstate)
}

// Disable pushState behavior.
//
// This is the case when a browser doesn't support pushState. It is
// sometimes useful to disable pushState for debugging on a modern
// browser.
//
// Examples
//
//     $.pjax.disable()
//
// Returns nothing.
function disable() {
  $.fn.pjax = function() { return this }
  $.pjax = fallbackPjax
  $.pjax.enable = enable
  $.pjax.disable = $.noop
  $.pjax.click = $.noop
  $.pjax.submit = $.noop
  $.pjax.reload = function() { window.location.reload() }

  $(window).off('popstate.pjax', onPjaxPopstate)
}


// Add the state property to jQuery's event object so we can use it in
// $(window).bind('popstate')
if ( $.inArray('state', $.event.props) < 0 )
  $.event.props.push('state')

// Is pjax supported by this browser?
$.support.pjax =
  window.history && window.history.pushState && window.history.replaceState &&
  // pushState isn't reliable on iOS until 5.
  !navigator.userAgent.match(/((iPod|iPhone|iPad).+\bOS\s+[1-4]|WebApps\/.+CFNetwork)/)

$.support.pjax ? enable() : disable()

})(jQuery);
/*
    json2.js
    2011-10-19

    Public Domain.

    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

    See http://www.JSON.org/js.html


    This code should be minified before deployment.
    See http://javascript.crockford.com/jsmin.html

    USE YOUR OWN COPY. IT IS EXTREMELY UNWISE TO LOAD CODE FROM SERVERS YOU DO
    NOT CONTROL.


    This file creates a global JSON object containing two methods: stringify
    and parse.

        JSON.stringify(value, replacer, space)
            value       any JavaScript value, usually an object or array.

            replacer    an optional parameter that determines how object
                        values are stringified for objects. It can be a
                        function or an array of strings.

            space       an optional parameter that specifies the indentation
                        of nested structures. If it is omitted, the text will
                        be packed without extra whitespace. If it is a number,
                        it will specify the number of spaces to indent at each
                        level. If it is a string (such as '\t' or '&nbsp;'),
                        it contains the characters used to indent at each level.

            This method produces a JSON text from a JavaScript value.

            When an object value is found, if the object contains a toJSON
            method, its toJSON method will be called and the result will be
            stringified. A toJSON method does not serialize: it returns the
            value represented by the name/value pair that should be serialized,
            or undefined if nothing should be serialized. The toJSON method
            will be passed the key associated with the value, and this will be
            bound to the value

            For example, this would serialize Dates as ISO strings.

                Date.prototype.toJSON = function (key) {
                    function f(n) {
                        // Format integers to have at least two digits.
                        return n < 10 ? '0' + n : n;
                    }

                    return this.getUTCFullYear()   + '-' +
                         f(this.getUTCMonth() + 1) + '-' +
                         f(this.getUTCDate())      + 'T' +
                         f(this.getUTCHours())     + ':' +
                         f(this.getUTCMinutes())   + ':' +
                         f(this.getUTCSeconds())   + 'Z';
                };

            You can provide an optional replacer method. It will be passed the
            key and value of each member, with this bound to the containing
            object. The value that is returned from your method will be
            serialized. If your method returns undefined, then the member will
            be excluded from the serialization.

            If the replacer parameter is an array of strings, then it will be
            used to select the members to be serialized. It filters the results
            such that only members with keys listed in the replacer array are
            stringified.

            Values that do not have JSON representations, such as undefined or
            functions, will not be serialized. Such values in objects will be
            dropped; in arrays they will be replaced with null. You can use
            a replacer function to replace those with JSON values.
            JSON.stringify(undefined) returns undefined.

            The optional space parameter produces a stringification of the
            value that is filled with line breaks and indentation to make it
            easier to read.

            If the space parameter is a non-empty string, then that string will
            be used for indentation. If the space parameter is a number, then
            the indentation will be that many spaces.

            Example:

            text = JSON.stringify(['e', {pluribus: 'unum'}]);
            // text is '["e",{"pluribus":"unum"}]'


            text = JSON.stringify(['e', {pluribus: 'unum'}], null, '\t');
            // text is '[\n\t"e",\n\t{\n\t\t"pluribus": "unum"\n\t}\n]'

            text = JSON.stringify([new Date()], function (key, value) {
                return this[key] instanceof Date ?
                    'Date(' + this[key] + ')' : value;
            });
            // text is '["Date(---current time---)"]'


        JSON.parse(text, reviver)
            This method parses a JSON text to produce an object or array.
            It can throw a SyntaxError exception.

            The optional reviver parameter is a function that can filter and
            transform the results. It receives each of the keys and values,
            and its return value is used instead of the original value.
            If it returns what it received, then the structure is not modified.
            If it returns undefined then the member is deleted.

            Example:

            // Parse the text. Values that look like ISO date strings will
            // be converted to Date objects.

            myData = JSON.parse(text, function (key, value) {
                var a;
                if (typeof value === 'string') {
                    a =
/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
                    if (a) {
                        return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4],
                            +a[5], +a[6]));
                    }
                }
                return value;
            });

            myData = JSON.parse('["Date(09/09/2001)"]', function (key, value) {
                var d;
                if (typeof value === 'string' &&
                        value.slice(0, 5) === 'Date(' &&
                        value.slice(-1) === ')') {
                    d = new Date(value.slice(5, -1));
                    if (d) {
                        return d;
                    }
                }
                return value;
            });


    This is a reference implementation. You are free to copy, modify, or
    redistribute.
*/

/*jslint evil: true, regexp: true */

/*members "", "\b", "\t", "\n", "\f", "\r", "\"", JSON, "\\", apply,
    call, charCodeAt, getUTCDate, getUTCFullYear, getUTCHours,
    getUTCMinutes, getUTCMonth, getUTCSeconds, hasOwnProperty, join,
    lastIndex, length, parse, prototype, push, replace, slice, stringify,
    test, toJSON, toString, valueOf
*/


// Create a JSON object only if one does not already exist. We create the
// methods in a closure to avoid creating global variables.

var JSON;
if (!JSON) {
    JSON = {};
}

(function () {
    'use strict';

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10 ? '0' + n : n;
    }

    if (typeof Date.prototype.toJSON !== 'function') {

        Date.prototype.toJSON = function (key) {

            return isFinite(this.valueOf())
                ? this.getUTCFullYear()     + '-' +
                    f(this.getUTCMonth() + 1) + '-' +
                    f(this.getUTCDate())      + 'T' +
                    f(this.getUTCHours())     + ':' +
                    f(this.getUTCMinutes())   + ':' +
                    f(this.getUTCSeconds())   + 'Z'
                : null;
        };

        String.prototype.toJSON      =
            Number.prototype.toJSON  =
            Boolean.prototype.toJSON = function (key) {
                return this.valueOf();
            };
    }

    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        gap,
        indent,
        meta = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        },
        rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string'
                ? c
                : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i,          // The loop counter.
            k,          // The member key.
            v,          // The member value.
            length,
            mind = gap,
            partial,
            value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

        if (value && typeof value === 'object' &&
                typeof value.toJSON === 'function') {
            value = value.toJSON(key);
        }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
        case 'string':
            return quote(value);

        case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

            return isFinite(value) ? String(value) : 'null';

        case 'boolean':
        case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

            return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

        case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

            if (!value) {
                return 'null';
            }

// Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

// Is the value an array?

            if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                v = partial.length === 0
                    ? '[]'
                    : gap
                    ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']'
                    : '[' + partial.join(',') + ']';
                gap = mind;
                return v;
            }

// If the replacer is an array, use it to select the members to be stringified.

            if (rep && typeof rep === 'object') {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    if (typeof rep[i] === 'string') {
                        k = rep[i];
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            } else {

// Otherwise, iterate through all of the keys in the object.

                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

            v = partial.length === 0
                ? '{}'
                : gap
                ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}'
                : '{' + partial.join(',') + '}';
            gap = mind;
            return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

            var i;
            gap = '';
            indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

            if (typeof space === 'number') {
                for (i = 0; i < space; i += 1) {
                    indent += ' ';
                }

// If the space parameter is a string, it will be used as the indent string.

            } else if (typeof space === 'string') {
                indent = space;
            }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== 'function' &&
                    (typeof replacer !== 'object' ||
                    typeof replacer.length !== 'number')) {
                throw new Error('JSON.stringify');
            }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

            return str('', {'': value});
        };
    }


// If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text, reviver) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            cx.lastIndex = 0;
            if (cx.test(text)) {
                text = text.replace(cx, function (a) {
                    return '\\u' +
                        ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with '()' and 'new'
// because they can cause invocation, and '=' because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

            if (/^[\],:{}\s]*$/
                    .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                        .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                        .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The '{' operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval('(' + text + ')');

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return typeof reviver === 'function'
                    ? walk({'': j}, '')
                    : j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError('JSON.parse');
        };
    }
}());
/**
 * jQuery Cookie plugin
 *
 * Copyright (c) 2010 Klaus Hartl (stilbuero.de)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 */

jQuery.cookie = function (key, value, options) {

    // key and at least value given, set cookie...
    if (arguments.length > 1 && String(value) !== "[object Object]") {
        options = jQuery.extend({}, options);

        if (value === null || value === undefined) {
            options.expires = -1;
        }

        if (typeof options.expires === 'number') {
            var days = options.expires, t = options.expires = new Date();
            t.setDate(t.getDate() + days);
        }

        value = String(value);

        return (document.cookie = [
            encodeURIComponent(key), '=',
            options.raw ? value : encodeURIComponent(value),
            options.expires ? '; expires=' + options.expires.toUTCString() : '', // use expires attribute, max-age is not supported by IE
            options.path ? '; path=' + options.path : '',
            options.domain ? '; domain=' + options.domain : '',
            options.secure ? '; secure' : ''
        ].join(''));
    }

    // key and possibly options given, get cookie...
    options = value || {};
    var result, decode = options.raw ? function (s) { return s; } : decodeURIComponent;
    return (result = new RegExp('(?:^|; )' + encodeURIComponent(key) + '=([^;]*)').exec(document.cookie)) ? decode(result[1]) : null;
};
(function( $ ){
  $.fn.ghostWriter = function( options ) {
    var settings = $.extend( {
       ghosttext: "",
       placeholder: "",
       infoclass: "ghostwriter_info",
       copyclass: "ghostwriter_hide"
    }, options);
    return (this.each(function(index, item) {
       var _element_id = $(item).attr("id") || "";
       item.ghostplaceholder = $(item).attr("data-placeholder") || settings.placeholder;
       item.ghosttext   = $(item).attr("data-ghost-text") || settings.ghosttext;
       item.ghosttextspan = $("<label />").text(item.ghostplaceholder);
       item.ghostCopy = $("<label />").addClass(settings.copyclass);
       item.ghostBox = $("<label />").attr("for", _element_id).addClass(settings.infoclass).append(item.ghostCopy).append(item.ghosttextspan);
       $(item).parent().prepend(item.ghostBox);
       $(item).bind("keyup keydown keypress change", 
               function(ev){
                  setTimeout(function(){
                    var placeholder_text = ($.trim($(item).val()) == "") ? item.ghostplaceholder : item.ghosttext
                    item.ghostCopy.text($(item).val());
                    item.ghosttextspan.text(placeholder_text);
                  }, 0)
               })
               .focusin(function(){
                  $(item).parent().addClass("active");
               })
               .focusout(function(){
                  $(item).parent().removeClass("active");
               });
               
    }));
  };
})(window.jQuery);
jQuery("[rel=ghostWriter]").ghostWriter()
;
/*! jQuery Validation Plugin - v1.10.0 - 9/7/2012
* https://github.com/jzaefferer/jquery-validation
* Copyright (c) 2012 Jörn Zaefferer; Licensed MIT, GPL */

(function(a){a.extend(a.fn,{validate:function(b){if(!this.length){b&&b.debug&&window.console&&console.warn("nothing selected, can't validate, returning nothing");return}var c=a.data(this[0],"validator");return c?c:(this.attr("novalidate","novalidate"),c=new a.validator(b,this[0]),a.data(this[0],"validator",c),c.settings.onsubmit&&(this.validateDelegate(":submit","click",function(b){c.settings.submitHandler&&(c.submitButton=b.target),a(b.target).hasClass("cancel")&&(c.cancelSubmit=!0)}),this.submit(function(b){function d(){var d;return c.settings.submitHandler?(c.submitButton&&(d=a("<input type='hidden'/>").attr("name",c.submitButton.name).val(c.submitButton.value).appendTo(c.currentForm)),c.settings.submitHandler.call(c,c.currentForm,b),c.submitButton&&d.remove(),!1):!0}return c.settings.debug&&b.preventDefault(),c.cancelSubmit?(c.cancelSubmit=!1,d()):c.form()?c.pendingRequest?(c.formSubmitted=!0,!1):d():(c.focusInvalid(),!1)})),c)},valid:function(){if(a(this[0]).is("form"))return this.validate().form();var b=!0,c=a(this[0].form).validate();return this.each(function(){b&=c.element(this)}),b},removeAttrs:function(b){var c={},d=this;return a.each(b.split(/\s/),function(a,b){c[b]=d.attr(b),d.removeAttr(b)}),c},rules:function(b,c){var d=this[0];if(b){var e=a.data(d.form,"validator").settings,f=e.rules,g=a.validator.staticRules(d);switch(b){case"add":a.extend(g,a.validator.normalizeRule(c)),f[d.name]=g,c.messages&&(e.messages[d.name]=a.extend(e.messages[d.name],c.messages));break;case"remove":if(!c)return delete f[d.name],g;var h={};return a.each(c.split(/\s/),function(a,b){h[b]=g[b],delete g[b]}),h}}var i=a.validator.normalizeRules(a.extend({},a.validator.metadataRules(d),a.validator.classRules(d),a.validator.attributeRules(d),a.validator.staticRules(d)),d);if(i.required){var j=i.required;delete i.required,i=a.extend({required:j},i)}return i}}),a.extend(a.expr[":"],{blank:function(b){return!a.trim(""+b.value)},filled:function(b){return!!a.trim(""+b.value)},unchecked:function(a){return!a.checked}}),a.validator=function(b,c){this.settings=a.extend(!0,{},a.validator.defaults,b),this.currentForm=c,this.init()},a.validator.format=function(b,c){return arguments.length===1?function(){var c=a.makeArray(arguments);return c.unshift(b),a.validator.format.apply(this,c)}:(arguments.length>2&&c.constructor!==Array&&(c=a.makeArray(arguments).slice(1)),c.constructor!==Array&&(c=[c]),a.each(c,function(a,c){b=b.replace(new RegExp("\\{"+a+"\\}","g"),c)}),b)},a.extend(a.validator,{defaults:{messages:{},groups:{},rules:{},errorClass:"error",validClass:"valid",errorElement:"label",focusInvalid:!0,errorContainer:a([]),errorLabelContainer:a([]),onsubmit:!0,ignore:":hidden",ignoreTitle:!1,onfocusin:function(a,b){this.lastActive=a,this.settings.focusCleanup&&!this.blockFocusCleanup&&(this.settings.unhighlight&&this.settings.unhighlight.call(this,a,this.settings.errorClass,this.settings.validClass),this.addWrapper(this.errorsFor(a)).hide())},onfocusout:function(a,b){!this.checkable(a)&&(a.name in this.submitted||!this.optional(a))&&this.element(a)},onkeyup:function(a,b){if(b.which===9&&this.elementValue(a)==="")return;(a.name in this.submitted||a===this.lastActive)&&this.element(a)},onclick:function(a,b){a.name in this.submitted?this.element(a):a.parentNode.name in this.submitted&&this.element(a.parentNode)},highlight:function(b,c,d){b.type==="radio"?this.findByName(b.name).addClass(c).removeClass(d):a(b).addClass(c).removeClass(d)},unhighlight:function(b,c,d){b.type==="radio"?this.findByName(b.name).removeClass(c).addClass(d):a(b).removeClass(c).addClass(d)}},setDefaults:function(b){a.extend(a.validator.defaults,b)},messages:{required:"This field is required.",remote:"Please fix this field.",email:"Please enter a valid email address.",url:"Please enter a valid URL.",date:"Please enter a valid date.",dateISO:"Please enter a valid date (ISO).",number:"Please enter a valid number.",digits:"Please enter only digits.",creditcard:"Please enter a valid credit card number.",equalTo:"Please enter the same value again.",maxlength:a.validator.format("Please enter no more than {0} characters."),minlength:a.validator.format("Please enter at least {0} characters."),rangelength:a.validator.format("Please enter a value between {0} and {1} characters long."),range:a.validator.format("Please enter a value between {0} and {1}."),max:a.validator.format("Please enter a value less than or equal to {0}."),min:a.validator.format("Please enter a value greater than or equal to {0}.")},autoCreateRanges:!1,prototype:{init:function(){function d(b){var c=a.data(this[0].form,"validator"),d="on"+b.type.replace(/^validate/,"");c.settings[d]&&c.settings[d].call(c,this[0],b)}this.labelContainer=a(this.settings.errorLabelContainer),this.errorContext=this.labelContainer.length&&this.labelContainer||a(this.currentForm),this.containers=a(this.settings.errorContainer).add(this.settings.errorLabelContainer),this.submitted={},this.valueCache={},this.pendingRequest=0,this.pending={},this.invalid={},this.reset();var b=this.groups={};a.each(this.settings.groups,function(c,d){a.each(d.split(/\s/),function(a,d){b[d]=c})});var c=this.settings.rules;a.each(c,function(b,d){c[b]=a.validator.normalizeRule(d)}),a(this.currentForm).validateDelegate(":text, [type='password'], [type='file'], select, textarea, [type='number'], [type='search'] ,[type='tel'], [type='url'], [type='email'], [type='datetime'], [type='date'], [type='month'], [type='week'], [type='time'], [type='datetime-local'], [type='range'], [type='color'] ","focusin focusout keyup",d).validateDelegate("[type='radio'], [type='checkbox'], select, option","click",d),this.settings.invalidHandler&&a(this.currentForm).bind("invalid-form.validate",this.settings.invalidHandler)},form:function(){return this.checkForm(),a.extend(this.submitted,this.errorMap),this.invalid=a.extend({},this.errorMap),this.valid()||a(this.currentForm).triggerHandler("invalid-form",[this]),this.showErrors(),this.valid()},checkForm:function(){this.prepareForm();for(var a=0,b=this.currentElements=this.elements();b[a];a++)this.check(b[a]);return this.valid()},element:function(b){b=this.validationTargetFor(this.clean(b)),this.lastElement=b,this.prepareElement(b),this.currentElements=a(b);var c=this.check(b)!==!1;return c?delete this.invalid[b.name]:this.invalid[b.name]=!0,this.numberOfInvalids()||(this.toHide=this.toHide.add(this.containers)),this.showErrors(),c},showErrors:function(b){if(b){a.extend(this.errorMap,b),this.errorList=[];for(var c in b)this.errorList.push({message:b[c],element:this.findByName(c)[0]});this.successList=a.grep(this.successList,function(a){return!(a.name in b)})}this.settings.showErrors?this.settings.showErrors.call(this,this.errorMap,this.errorList):this.defaultShowErrors()},resetForm:function(){a.fn.resetForm&&a(this.currentForm).resetForm(),this.submitted={},this.lastElement=null,this.prepareForm(),this.hideErrors(),this.elements().removeClass(this.settings.errorClass).removeData("previousValue")},numberOfInvalids:function(){return this.objectLength(this.invalid)},objectLength:function(a){var b=0;for(var c in a)b++;return b},hideErrors:function(){this.addWrapper(this.toHide).hide()},valid:function(){return this.size()===0},size:function(){return this.errorList.length},focusInvalid:function(){if(this.settings.focusInvalid)try{a(this.findLastActive()||this.errorList.length&&this.errorList[0].element||[]).filter(":visible").focus().trigger("focusin")}catch(b){}},findLastActive:function(){var b=this.lastActive;return b&&a.grep(this.errorList,function(a){return a.element.name===b.name}).length===1&&b},elements:function(){var b=this,c={};return a(this.currentForm).find("input, select, textarea").not(":submit, :reset, :image, [disabled]").not(this.settings.ignore).filter(function(){return!this.name&&b.settings.debug&&window.console&&console.error("%o has no name assigned",this),this.name in c||!b.objectLength(a(this).rules())?!1:(c[this.name]=!0,!0)})},clean:function(b){return a(b)[0]},errors:function(){var b=this.settings.errorClass.replace(" ",".");return a(this.settings.errorElement+"."+b,this.errorContext)},reset:function(){this.successList=[],this.errorList=[],this.errorMap={},this.toShow=a([]),this.toHide=a([]),this.currentElements=a([])},prepareForm:function(){this.reset(),this.toHide=this.errors().add(this.containers)},prepareElement:function(a){this.reset(),this.toHide=this.errorsFor(a)},elementValue:function(b){var c=a(b).attr("type"),d=a(b).val();return c==="radio"||c==="checkbox"?a('input[name="'+a(b).attr("name")+'"]:checked').val():typeof d=="string"?d.replace(/\r/g,""):d},check:function(b){b=this.validationTargetFor(this.clean(b));var c=a(b).rules(),d=!1,e=this.elementValue(b),f;for(var g in c){var h={method:g,parameters:c[g]};try{f=a.validator.methods[g].call(this,e,b,h.parameters);if(f==="dependency-mismatch"){d=!0;continue}d=!1;if(f==="pending"){this.toHide=this.toHide.not(this.errorsFor(b));return}if(!f)return this.formatAndAdd(b,h),!1}catch(i){throw this.settings.debug&&window.console&&console.log("exception occured when checking element "+b.id+", check the '"+h.method+"' method",i),i}}if(d)return;return this.objectLength(c)&&this.successList.push(b),!0},customMetaMessage:function(b,c){if(!a.metadata)return;var d=this.settings.meta?a(b).metadata()[this.settings.meta]:a(b).metadata();return d&&d.messages&&d.messages[c]},customDataMessage:function(b,c){return a(b).data("msg-"+c.toLowerCase())||b.attributes&&a(b).attr("data-msg-"+c.toLowerCase())},customMessage:function(a,b){var c=this.settings.messages[a];return c&&(c.constructor===String?c:c[b])},findDefined:function(){for(var a=0;a<arguments.length;a++)if(arguments[a]!==undefined)return arguments[a];return undefined},defaultMessage:function(b,c){return this.findDefined(this.customMessage(b.name,c),this.customDataMessage(b,c),this.customMetaMessage(b,c),!this.settings.ignoreTitle&&b.title||undefined,a.validator.messages[c],"<strong>Warning: No message defined for "+b.name+"</strong>")},formatAndAdd:function(b,c){var d=this.defaultMessage(b,c.method),e=/\$?\{(\d+)\}/g;typeof d=="function"?d=d.call(this,c.parameters,b):e.test(d)&&(d=a.validator.format(d.replace(e,"{$1}"),c.parameters)),this.errorList.push({message:d,element:b}),this.errorMap[b.name]=d,this.submitted[b.name]=d},addWrapper:function(a){return this.settings.wrapper&&(a=a.add(a.parent(this.settings.wrapper))),a},defaultShowErrors:function(){var a,b;for(a=0;this.errorList[a];a++){var c=this.errorList[a];this.settings.highlight&&this.settings.highlight.call(this,c.element,this.settings.errorClass,this.settings.validClass),this.showLabel(c.element,c.message)}this.errorList.length&&(this.toShow=this.toShow.add(this.containers));if(this.settings.success)for(a=0;this.successList[a];a++)this.showLabel(this.successList[a]);if(this.settings.unhighlight)for(a=0,b=this.validElements();b[a];a++)this.settings.unhighlight.call(this,b[a],this.settings.errorClass,this.settings.validClass);this.toHide=this.toHide.not(this.toShow),this.hideErrors(),this.addWrapper(this.toShow).show()},validElements:function(){return this.currentElements.not(this.invalidElements())},invalidElements:function(){return a(this.errorList).map(function(){return this.element})},showLabel:function(b,c){var d=this.errorsFor(b);d.length?(d.removeClass(this.settings.validClass).addClass(this.settings.errorClass),d.attr("generated")&&d.html(c)):(d=a("<"+this.settings.errorElement+"/>").attr({"for":this.idOrName(b),generated:!0}).addClass(this.settings.errorClass).html(c||""),this.settings.wrapper&&(d=d.hide().show().wrap("<"+this.settings.wrapper+"/>").parent()),this.labelContainer.append(d).length||(this.settings.errorPlacement?this.settings.errorPlacement(d,a(b)):d.insertAfter(b))),!c&&this.settings.success&&(d.text(""),typeof this.settings.success=="string"?d.addClass(this.settings.success):this.settings.success(d,b)),this.toShow=this.toShow.add(d)},errorsFor:function(b){var c=this.idOrName(b);return this.errors().filter(function(){return a(this).attr("for")===c})},idOrName:function(a){return this.groups[a.name]||(this.checkable(a)?a.name:a.id||a.name)},validationTargetFor:function(a){return this.checkable(a)&&(a=this.findByName(a.name).not(this.settings.ignore)[0]),a},checkable:function(a){return/radio|checkbox/i.test(a.type)},findByName:function(b){return a(this.currentForm).find('[name="'+b+'"]')},getLength:function(b,c){switch(c.nodeName.toLowerCase()){case"select":return a("option:selected",c).length;case"input":if(this.checkable(c))return this.findByName(c.name).filter(":checked").length}return b.length},depend:function(a,b){return this.dependTypes[typeof a]?this.dependTypes[typeof a](a,b):!0},dependTypes:{"boolean":function(a,b){return a},string:function(b,c){return!!a(b,c.form).length},"function":function(a,b){return a(b)}},optional:function(b){var c=this.elementValue(b);return!a.validator.methods.required.call(this,c,b)&&"dependency-mismatch"},startRequest:function(a){this.pending[a.name]||(this.pendingRequest++,this.pending[a.name]=!0)},stopRequest:function(b,c){this.pendingRequest--,this.pendingRequest<0&&(this.pendingRequest=0),delete this.pending[b.name],c&&this.pendingRequest===0&&this.formSubmitted&&this.form()?(a(this.currentForm).submit(),this.formSubmitted=!1):!c&&this.pendingRequest===0&&this.formSubmitted&&(a(this.currentForm).triggerHandler("invalid-form",[this]),this.formSubmitted=!1)},previousValue:function(b){return a.data(b,"previousValue")||a.data(b,"previousValue",{old:null,valid:!0,message:this.defaultMessage(b,"remote")})}},classRuleSettings:{required:{required:!0},email:{email:!0},url:{url:!0},date:{date:!0},dateISO:{dateISO:!0},number:{number:!0},digits:{digits:!0},creditcard:{creditcard:!0}},addClassRules:function(b,c){b.constructor===String?this.classRuleSettings[b]=c:a.extend(this.classRuleSettings,b)},classRules:function(b){var c={},d=a(b).attr("class");return d&&a.each(d.split(" "),function(){this in a.validator.classRuleSettings&&a.extend(c,a.validator.classRuleSettings[this])}),c},attributeRules:function(b){var c={},d=a(b);for(var e in a.validator.methods){var f;e==="required"?(f=d.get(0).getAttribute(e),f===""&&(f=!0),f=!!f):f=d.attr(e),f?c[e]=f:d[0].getAttribute("type")===e&&(c[e]=!0)}return c.maxlength&&/-1|2147483647|524288/.test(c.maxlength)&&delete c.maxlength,c},metadataRules:function(b){if(!a.metadata)return{};var c=a.data(b.form,"validator").settings.meta;return c?a(b).metadata()[c]:a(b).metadata()},staticRules:function(b){var c={},d=a.data(b.form,"validator");return d.settings.rules&&(c=a.validator.normalizeRule(d.settings.rules[b.name])||{}),c},normalizeRules:function(b,c){return a.each(b,function(d,e){if(e===!1){delete b[d];return}if(e.param||e.depends){var f=!0;switch(typeof e.depends){case"string":f=!!a(e.depends,c.form).length;break;case"function":f=e.depends.call(c,c)}f?b[d]=e.param!==undefined?e.param:!0:delete b[d]}}),a.each(b,function(d,e){b[d]=a.isFunction(e)?e(c):e}),a.each(["minlength","maxlength","min","max"],function(){b[this]&&(b[this]=Number(b[this]))}),a.each(["rangelength","range"],function(){b[this]&&(b[this]=[Number(b[this][0]),Number(b[this][1])])}),a.validator.autoCreateRanges&&(b.min&&b.max&&(b.range=[b.min,b.max],delete b.min,delete b.max),b.minlength&&b.maxlength&&(b.rangelength=[b.minlength,b.maxlength],delete b.minlength,delete b.maxlength)),b.messages&&delete b.messages,b},normalizeRule:function(b){if(typeof b=="string"){var c={};a.each(b.split(/\s/),function(){c[this]=!0}),b=c}return b},addMethod:function(b,c,d){a.validator.methods[b]=c,a.validator.messages[b]=d!==undefined?d:a.validator.messages[b],c.length<3&&a.validator.addClassRules(b,a.validator.normalizeRule(b))},methods:{required:function(b,c,d){if(!this.depend(d,c))return"dependency-mismatch";if(c.nodeName.toLowerCase()==="select"){var e=a(c).val();return e&&e.length>0}return this.checkable(c)?this.getLength(b,c)>0:a.trim(b).length>0},remote:function(b,c,d){if(this.optional(c))return"dependency-mismatch";var e=this.previousValue(c);this.settings.messages[c.name]||(this.settings.messages[c.name]={}),e.originalMessage=this.settings.messages[c.name].remote,this.settings.messages[c.name].remote=e.message,d=typeof d=="string"&&{url:d}||d;if(this.pending[c.name])return"pending";if(e.old===b)return e.valid;e.old=b;var f=this;this.startRequest(c);var g={};return g[c.name]=b,a.ajax(a.extend(!0,{url:d,mode:"abort",port:"validate"+c.name,dataType:"json",data:g,success:function(d){f.settings.messages[c.name].remote=e.originalMessage;var g=d===!0||d==="true";if(g){var h=f.formSubmitted;f.prepareElement(c),f.formSubmitted=h,f.successList.push(c),delete f.invalid[c.name],f.showErrors()}else{var i={},j=d||f.defaultMessage(c,"remote");i[c.name]=e.message=a.isFunction(j)?j(b):j,f.invalid[c.name]=!0,f.showErrors(i)}e.valid=g,f.stopRequest(c,g)}},d)),"pending"},minlength:function(b,c,d){var e=a.isArray(b)?b.length:this.getLength(a.trim(b),c);return this.optional(c)||e>=d},maxlength:function(b,c,d){var e=a.isArray(b)?b.length:this.getLength(a.trim(b),c);return this.optional(c)||e<=d},rangelength:function(b,c,d){var e=a.isArray(b)?b.length:this.getLength(a.trim(b),c);return this.optional(c)||e>=d[0]&&e<=d[1]},min:function(a,b,c){return this.optional(b)||a>=c},max:function(a,b,c){return this.optional(b)||a<=c},range:function(a,b,c){return this.optional(b)||a>=c[0]&&a<=c[1]},email:function(a,b){return this.optional(b)||/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i.test(a)},url:function(a,b){return this.optional(b)||/^(https?|ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i.test(a)},date:function(a,b){return this.optional(b)||!/Invalid|NaN/.test(new Date(a))},dateISO:function(a,b){return this.optional(b)||/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(a)},number:function(a,b){return this.optional(b)||/^-?(?:\d+|\d{1,3}(?:,\d{3})+)?(?:\.\d+)?$/.test(a)},digits:function(a,b){return this.optional(b)||/^\d+$/.test(a)},creditcard:function(a,b){if(this.optional(b))return"dependency-mismatch";if(/[^0-9 \-]+/.test(a))return!1;var c=0,d=0,e=!1;a=a.replace(/\D/g,"");for(var f=a.length-1;f>=0;f--){var g=a.charAt(f);d=parseInt(g,10),e&&(d*=2)>9&&(d-=9),c+=d,e=!e}return c%10===0},equalTo:function(b,c,d){var e=a(d);return this.settings.onfocusout&&e.unbind(".validate-equalTo").bind("blur.validate-equalTo",function(){a(c).valid()}),b===e.val()}}}),a.format=a.validator.format})(jQuery),function(a){var b={};if(a.ajaxPrefilter)a.ajaxPrefilter(function(a,c,d){var e=a.port;a.mode==="abort"&&(b[e]&&b[e].abort(),b[e]=d)});else{var c=a.ajax;a.ajax=function(d){var e=("mode"in d?d:a.ajaxSettings).mode,f=("port"in d?d:a.ajaxSettings).port;return e==="abort"?(b[f]&&b[f].abort(),b[f]=c.apply(this,arguments)):c.apply(this,arguments)}}}(jQuery),function(a){!jQuery.event.special.focusin&&!jQuery.event.special.focusout&&document.addEventListener&&a.each({focus:"focusin",blur:"focusout"},function(b,c){function d(b){return b=a.event.fix(b),b.type=c,a.event.handle.call(this,b)}a.event.special[c]={setup:function(){this.addEventListener(b,d,!0)},teardown:function(){this.removeEventListener(b,d,!0)},handler:function(b){var d=arguments;return d[0]=a.event.fix(b),d[0].type=c,a.event.handle.apply(this,d)}}}),a.extend(a.fn,{validateDelegate:function(b,c,d){return this.bind(c,function(c){var e=a(c.target);if(e.is(b))return d.apply(e,arguments)})}})}(jQuery)
;
// Generated by CoffeeScript 1.4.0

/*
Sticky Elements Shortcut for jQuery Waypoints - v2.0.2
Copyright (c) 2011-2013 Caleb Troughton
Dual licensed under the MIT license and GPL license.
https://github.com/imakewebthings/jquery-waypoints/blob/master/licenses.txt
*/



(function() {
  
  (function(root, factory) {
    if (typeof define === 'function' && define.amd) {
      return define(['jquery', 'waypoints'], factory);
    } else {
      return factory(root.jQuery);
    }
  })(this, function($) {
    var defaults, wrap;
    defaults = {
      wrapper: '<div class="sticky-wrapper" />',
      stuckClass: 'stuck in',
      stopSticky: '.stick-stop',
      setWidth: true,
      stickyStartCallback: function(){}
    };
    wrap = function($elements, options) {
      $elements.wrap(options.wrapper);
      $elements.each(function() {
        var $this = $(this);

        $this.parent().height($this.outerHeight());

        if(options.setWidth){ $this.width($this.outerWidth()); }

        if(options.offset){ $this.css('top', options.offset); }

      });
      return $elements.parent();
    };   
    return $.waypoints('extendFn', 'sticky', function(options) {
      var $wrap, originalHandler, $sticky = $(this);
      options = $.extend({}, $.fn.waypoint.defaults, defaults, options);
      $wrap = wrap(this, options);
      originalHandler = options.handler;
      options.handler = function(direction) {
        var shouldBeStuck;
        shouldBeStuck = direction === 'down' || direction === 'right';
        $sticky.toggleClass(options.stuckClass, shouldBeStuck);
          
        options.stickyStartCallback(this, direction);

        if (originalHandler != null) {
          return originalHandler.call(this, direction);
        }
      };


      $(options.stopSticky).waypoint({
        offset: function() {
          return ($sticky.hasClass("sticky-sidebar")) ? 0 : $sticky.height();
        },
        handler: function(direction) {
          var $this = $(this)
          if(direction === 'down' || direction === 'right'){
            $sticky.removeClass("stuck")
            if($sticky.hasClass("sticky-sidebar") && $this.position() !== undefined){
              $sticky.css({
                "top": parseInt($this.position().top) + parseInt(options.offset) + "px",
                "position": "absolute"
              })
            }            
          }else{
            $sticky.addClass("stuck")
            if($sticky.hasClass("sticky-sidebar")){
              $sticky.css({
                "top": options.offset,
                "position": ""
              })
            }
          }
        }
      })

      $wrap.waypoint(options);
      return this;
    });
  });

}).call(this);
/*!
 * Smooth Scroll - v1.4.11 - 2013-07-15
 * https://github.com/kswedberg/jquery-smooth-scroll
 * Copyright (c) 2013 Karl Swedberg
 * Licensed MIT (https://github.com/kswedberg/jquery-smooth-scroll/blob/master/LICENSE-MIT)
 */


(function($) {

var version = '1.4.11',
    defaults = {
      exclude: [],
      excludeWithin:[],
      offset: 0,

      // one of 'top' or 'left'
      direction: 'top',

      // jQuery set of elements you wish to scroll (for $.smoothScroll).
      //  if null (default), $('html, body').firstScrollable() is used.
      scrollElement: null,

      // only use if you want to override default behavior
      scrollTarget: null,

      // fn(opts) function to be called before scrolling occurs.
      // `this` is the element(s) being scrolled
      beforeScroll: function() {},

      // fn(opts) function to be called after scrolling occurs.
      // `this` is the triggering element
      afterScroll: function() {},
      easing: 'swing',
      speed: 400,

      // coefficient for "auto" speed
      autoCoefficent: 2,

      // $.fn.smoothScroll only: whether to prevent the default click action
      preventDefault: true
    },

    getScrollable = function(opts) {
      var scrollable = [],
          scrolled = false,
          dir = opts.dir && opts.dir == 'left' ? 'scrollLeft' : 'scrollTop';

      this.each(function() {

        if (this == document || this == window) { return; }
        var el = $(this);
        if ( el[dir]() > 0 ) {
          scrollable.push(this);
        } else {
          // if scroll(Top|Left) === 0, nudge the element 1px and see if it moves
          el[dir](1);
          scrolled = el[dir]() > 0;
          if ( scrolled ) {
            scrollable.push(this);
          }
          // then put it back, of course
          el[dir](0);
        }
      });

      // If no scrollable elements, fall back to <body>,
      // if it's in the jQuery collection
      // (doing this because Safari sets scrollTop async,
      // so can't set it to 1 and immediately get the value.)
      if (!scrollable.length) {
        this.each(function(index) {
          if (this.nodeName === 'BODY') {
            scrollable = [this];
          }
        });
      }

      // Use the first scrollable element if we're calling firstScrollable()
      if ( opts.el === 'first' && scrollable.length > 1 ) {
        scrollable = [ scrollable[0] ];
      }

      return scrollable;
    },
    isTouch = 'ontouchend' in document;

$.fn.extend({
  scrollable: function(dir) {
    var scrl = getScrollable.call(this, {dir: dir});
    return this.pushStack(scrl);
  },
  firstScrollable: function(dir) {
    var scrl = getScrollable.call(this, {el: 'first', dir: dir});
    return this.pushStack(scrl);
  },

  smoothScroll: function(options) {
    options = options || {};
    var opts = $.extend({}, $.fn.smoothScroll.defaults, options),
        locationPath = $.smoothScroll.filterPath(location.pathname);

    this
    .unbind('click.smoothscroll')
    .bind('click.smoothscroll', function(event) {
      var link = this,
          $link = $(this),
          exclude = opts.exclude,
          excludeWithin = opts.excludeWithin,
          elCounter = 0, ewlCounter = 0,
          include = true,
          clickOpts = {},
          hostMatch = ((location.hostname === link.hostname) || !link.hostname),
          pathMatch = opts.scrollTarget || ( $.smoothScroll.filterPath(link.pathname) || locationPath ) === locationPath,
          thisHash = escapeSelector(link.hash);

      if ( !opts.scrollTarget && (!hostMatch || !pathMatch || !thisHash) ) {
        include = false;
      } else {
        while (include && elCounter < exclude.length) {
          if ($link.is(escapeSelector(exclude[elCounter++]))) {
            include = false;
          }
        }
        while ( include && ewlCounter < excludeWithin.length ) {
          if ($link.closest(excludeWithin[ewlCounter++]).length) {
            include = false;
          }
        }
      }

      if ( include ) {

        if ( opts.preventDefault ) {
          event.preventDefault();
        }

        $.extend( clickOpts, opts, {
          scrollTarget: opts.scrollTarget || thisHash,
          link: link
        });

        $.smoothScroll( clickOpts );
      }
    });

    return this;
  }
});

$.smoothScroll = function(options, px) {
  var opts, $scroller, scrollTargetOffset, speed,
      scrollerOffset = 0,
      offPos = 'offset',
      scrollDir = 'scrollTop',
      aniProps = {},
      aniOpts = {},
      scrollprops = [];


  if (typeof options === 'number') {
    opts = $.fn.smoothScroll.defaults;
    scrollTargetOffset = options;
  } else {
    opts = $.extend({}, $.fn.smoothScroll.defaults, options || {});
    if (opts.scrollElement) {
      offPos = 'position';
      if (opts.scrollElement.css('position') == 'static') {
        opts.scrollElement.css('position', 'relative');
      }
    }
  }

  opts = $.extend({link: null}, opts);
  scrollDir = opts.direction == 'left' ? 'scrollLeft' : scrollDir;

  if ( opts.scrollElement ) {
    $scroller = opts.scrollElement;
    scrollerOffset = $scroller[scrollDir]();
  } else {
    $scroller = $('html, body').firstScrollable();
  }

  // beforeScroll callback function must fire before calculating offset
  opts.beforeScroll.call($scroller, opts);

  scrollTargetOffset = (typeof options === 'number') ? options :
                        px ||
                        ( $(opts.scrollTarget)[offPos]() &&
                        $(opts.scrollTarget)[offPos]()[opts.direction] ) ||
                        0;

  aniProps[scrollDir] = scrollTargetOffset + scrollerOffset + opts.offset;
  speed = opts.speed;

  // automatically calculate the speed of the scroll based on distance / coefficient
  if (speed === 'auto') {

    // if aniProps[scrollDir] == 0 then we'll use scrollTop() value instead
    speed = aniProps[scrollDir] || $scroller.scrollTop();

    // divide the speed by the coefficient
    speed = speed / opts.autoCoefficent;
  }

  aniOpts = {
    duration: speed,
    easing: opts.easing,
    complete: function() {
      opts.afterScroll.call(opts.link, opts);
    }
  };

  if (opts.step) {
    aniOpts.step = opts.step;
  }

  if ($scroller.length) {
    $scroller.stop().animate(aniProps, aniOpts);
  } else {
    opts.afterScroll.call(opts.link, opts);
  }
};

$.smoothScroll.version = version;
$.smoothScroll.filterPath = function(string) {
  return string
    .replace(/^\//,'')
    .replace(/(index|default).[a-zA-Z]{3,4}$/,'')
    .replace(/\/$/,'');
};

// default options
$.fn.smoothScroll.defaults = defaults;

function escapeSelector (str) {
  return str.replace(/(:|\.)/g,'\\$1');
}

})(jQuery);
!function( $ ) {

	"use strict"

	/* AUTOPLAY PUBLIC CLASS DEFINITION
	* ============================== */
	var FD_AutoPlay = function(element, options){		
		this.$element 		= $(element)
		this.$interval 		= null		
		this.options 		= $.extend({}, $.fn.fd_autoplay.defaults, options, this.$element.data())
		
		// Waypoint check
		this.$waypoint 		= this.options.waypoint && checkPlugin('waypoint')

		this.$items 		= this.$element.find(this.options.triggerItem)
		this.$currentItem	= this.$items.first()

		this.$element
			.delegate(this.options.triggerItem, "click.fd_autoplay", $.proxy(this.select, this))

		// Start the animation from the current item
		if(this.options.autoPlay && !this.$waypoint) this.start()

		if(this.$waypoint){
			this.$element.waypoint(this.options);
			this.$element.waypoint({
				offset: function(){ return -$(this).height(); },
				handler: this.options.handlerDown
			});
		}
	}
	
	FD_AutoPlay.prototype = {
		constructor: FD_AutoPlay
		// To start the slide at anypoint
	,   start: function(e){
			e && e.preventDefault()

			if(this.$started) return

			this.$currentItem.trigger("click")
			this.$interval = setInterval($.proxy(this.nextSlide, this), this.options.duration)

			this.$started = true
		} 
		// To move to the next item
	,	nextSlide: function(e){
			this.$items.removeClass("active")
			this.$currentItem = $(this.$currentItem.next().get(0))

			if(!this.$currentItem.get(0))
				this.$currentItem = this.$items.first()				
				
			this.$currentItem.addClass("active")

			this.selectSlideItem()

			this.options.changeSlide(this.$currentItem)
		}
		// To stop the slide at anypoint
	,	stop: function(e){
			e && e.preventDefault()
			this.$started = false
			clearInterval(this.$interval)
		}
		// Select a particular silde
	,	select: function(e){
			// e && e.preventDefault()

			this.stop()

			if(this.options.stopOnClick == false){			
				setTimeout($.proxy(this.start, this), this.options.duration)
			}	

			this.$currentItem = $(e.currentTarget);
			this.$items.removeClass("active")
			this.$currentItem.addClass("active")

			this.selectSlideItem()

			this.options.changeSlide(this.$currentItem)
		}
	,	selectSlideItem: function(e){
			if(this.options.slideItem != ''){
				$(this.options.slideItem + ".active").removeClass("active")
				$(this.options.slideItem + ":eq("+ this.$currentItem.index() +")").addClass("active")
			}
		}
	}

	$.fn.fd_autoplay = function(option, opt_setting) {
		return this.each(function () {
			var $this = $(this)
			, data = $this.data('fd_autoplay')
			, options = typeof option == 'object' && option

			if(!data) $this.data('fd_autoplay', (data = new FD_AutoPlay(this, options)))

			if(typeof option == 'string') data[option](opt_setting)
		})
	}

	$.fn.fd_autoplay.defaults = {
		// autoplays the set on load of the document
		autoPlay: true,
		// Duration for each slide
		duration: 5000,
	  	// Stops play when an item is selected manually 
	  	stopOnClick: true,
	  	// Any dom element inside the container 
	  	// So general action calls are binded during this stage
	  	triggerItem: "a",
	  	// Associated slide to make active
	  	slideItem: "",
	  	// On change of item
	  	changeSlide: function(){ },
	  	// !IMPORTANT the options requires jQuery waypoint http://imakewebthings.com/jquery-waypoints/
		// autoplay on waypoint
		// All waypoint related options can be namespaced with data-waypoint-...
		waypoint: false, // true | false
		activateClass: "animate",		
		triggerOnce: true,
		offset: "50%",
		handler: function(direction){
			var src_opts = $(this).data('fd_autoplay')

			if(src_opts){
				$(this).addClass(src_opts.options.activateClass)
				$(this).fd_autoplay("start")
			}
		},
		// handle when the bottom reaches the top of the viewport
		handlerDown: function(direction){
			$(this).fd_autoplay((direction == 'down') ? "stop" : "start")
		}
	}

	$.fn.fd_autoplay.Constructor = FD_AutoPlay

}(window.jQuery);
/*! fancyBox v2.1.5 fancyapps.com | fancyapps.com/fancybox/#license */

(function(r,G,f,v){var J=f("html"),n=f(r),p=f(G),b=f.fancybox=function(){b.open.apply(this,arguments)},I=navigator.userAgent.match(/msie/i),B=null,s=G.createTouch!==v,t=function(a){return a&&a.hasOwnProperty&&a instanceof f},q=function(a){return a&&"string"===f.type(a)},E=function(a){return q(a)&&0<a.indexOf("%")},l=function(a,d){var e=parseInt(a,10)||0;d&&E(a)&&(e*=b.getViewport()[d]/100);return Math.ceil(e)},w=function(a,b){return l(a,b)+"px"};f.extend(b,{version:"2.1.5",defaults:{padding:15,margin:20,
width:800,height:600,minWidth:100,minHeight:100,maxWidth:9999,maxHeight:9999,pixelRatio:1,autoSize:!0,autoHeight:!1,autoWidth:!1,autoResize:!0,autoCenter:!s,fitToView:!0,aspectRatio:!1,topRatio:0.5,leftRatio:0.5,scrolling:"auto",wrapCSS:"",arrows:!0,closeBtn:!0,closeClick:!1,nextClick:!1,mouseWheel:!0,autoPlay:!1,playSpeed:3E3,preload:3,modal:!1,loop:!0,ajax:{dataType:"html",headers:{"X-fancyBox":!0}},iframe:{scrolling:"auto",preload:!0},swf:{wmode:"transparent",allowfullscreen:"true",allowscriptaccess:"always"},
keys:{next:{13:"left",34:"up",39:"left",40:"up"},prev:{8:"right",33:"down",37:"right",38:"down"},close:[27],play:[32],toggle:[70]},direction:{next:"left",prev:"right"},scrollOutside:!0,index:0,type:null,href:null,content:null,title:null,tpl:{wrap:'<div class="fancybox-wrap" tabIndex="-1"><div class="fancybox-skin"><div class="fancybox-outer"><div class="fancybox-inner"></div></div></div></div>',image:'<img class="fancybox-image" src="{href}" alt="" />',iframe:'<iframe id="fancybox-frame{rnd}" name="fancybox-frame{rnd}" class="fancybox-iframe" frameborder="0" vspace="0" hspace="0" webkitAllowFullScreen mozallowfullscreen allowFullScreen'+
(I?' allowtransparency="true"':"")+"></iframe>",error:'<p class="fancybox-error">The requested content cannot be loaded.<br/>Please try again later.</p>',closeBtn:'<a title="Close" class="fancybox-item fancybox-close" href="javascript:;"></a>',next:'<a title="Next" class="fancybox-nav fancybox-next" href="javascript:;"><span></span></a>',prev:'<a title="Previous" class="fancybox-nav fancybox-prev" href="javascript:;"><span></span></a>'},openEffect:"fade",openSpeed:250,openEasing:"swing",openOpacity:!0,
openMethod:"zoomIn",closeEffect:"fade",closeSpeed:250,closeEasing:"swing",closeOpacity:!0,closeMethod:"zoomOut",nextEffect:"elastic",nextSpeed:250,nextEasing:"swing",nextMethod:"changeIn",prevEffect:"elastic",prevSpeed:250,prevEasing:"swing",prevMethod:"changeOut",helpers:{overlay:!0,title:!0},onCancel:f.noop,beforeLoad:f.noop,afterLoad:f.noop,beforeShow:f.noop,afterShow:f.noop,beforeChange:f.noop,beforeClose:f.noop,afterClose:f.noop},group:{},opts:{},previous:null,coming:null,current:null,isActive:!1,
isOpen:!1,isOpened:!1,wrap:null,skin:null,outer:null,inner:null,player:{timer:null,isActive:!1},ajaxLoad:null,imgPreload:null,transitions:{},helpers:{},open:function(a,d){if(a&&(f.isPlainObject(d)||(d={}),!1!==b.close(!0)))return f.isArray(a)||(a=t(a)?f(a).get():[a]),f.each(a,function(e,c){var k={},g,h,j,m,l;"object"===f.type(c)&&(c.nodeType&&(c=f(c)),t(c)?(k={href:c.data("fancybox-href")||c.attr("href"),title:c.data("fancybox-title")||c.attr("title"),isDom:!0,element:c},f.metadata&&f.extend(!0,k,
c.metadata())):k=c);g=d.href||k.href||(q(c)?c:null);h=d.title!==v?d.title:k.title||"";m=(j=d.content||k.content)?"html":d.type||k.type;!m&&k.isDom&&(m=c.data("fancybox-type"),m||(m=(m=c.prop("class").match(/fancybox\.(\w+)/))?m[1]:null));q(g)&&(m||(b.isImage(g)?m="image":b.isSWF(g)?m="swf":"#"===g.charAt(0)?m="inline":q(c)&&(m="html",j=c)),"ajax"===m&&(l=g.split(/\s+/,2),g=l.shift(),l=l.shift()));j||("inline"===m?g?j=f(q(g)?g.replace(/.*(?=#[^\s]+$)/,""):g):k.isDom&&(j=c):"html"===m?j=g:!m&&(!g&&
k.isDom)&&(m="inline",j=c));f.extend(k,{href:g,type:m,content:j,title:h,selector:l});a[e]=k}),b.opts=f.extend(!0,{},b.defaults,d),d.keys!==v&&(b.opts.keys=d.keys?f.extend({},b.defaults.keys,d.keys):!1),b.group=a,b._start(b.opts.index)},cancel:function(){var a=b.coming;a&&!1!==b.trigger("onCancel")&&(b.hideLoading(),b.ajaxLoad&&b.ajaxLoad.abort(),b.ajaxLoad=null,b.imgPreload&&(b.imgPreload.onload=b.imgPreload.onerror=null),a.wrap&&a.wrap.stop(!0,!0).trigger("onReset").remove(),b.coming=null,b.current||
b._afterZoomOut(a))},close:function(a){b.cancel();!1!==b.trigger("beforeClose")&&(b.unbindEvents(),b.isActive&&(!b.isOpen||!0===a?(f(".fancybox-wrap").stop(!0).trigger("onReset").remove(),b._afterZoomOut()):(b.isOpen=b.isOpened=!1,b.isClosing=!0,f(".fancybox-item, .fancybox-nav").remove(),b.wrap.stop(!0,!0).removeClass("fancybox-opened"),b.transitions[b.current.closeMethod]())))},play:function(a){var d=function(){clearTimeout(b.player.timer)},e=function(){d();b.current&&b.player.isActive&&(b.player.timer=
setTimeout(b.next,b.current.playSpeed))},c=function(){d();p.unbind(".player");b.player.isActive=!1;b.trigger("onPlayEnd")};if(!0===a||!b.player.isActive&&!1!==a){if(b.current&&(b.current.loop||b.current.index<b.group.length-1))b.player.isActive=!0,p.bind({"onCancel.player beforeClose.player":c,"onUpdate.player":e,"beforeLoad.player":d}),e(),b.trigger("onPlayStart")}else c()},next:function(a){var d=b.current;d&&(q(a)||(a=d.direction.next),b.jumpto(d.index+1,a,"next"))},prev:function(a){var d=b.current;
d&&(q(a)||(a=d.direction.prev),b.jumpto(d.index-1,a,"prev"))},jumpto:function(a,d,e){var c=b.current;c&&(a=l(a),b.direction=d||c.direction[a>=c.index?"next":"prev"],b.router=e||"jumpto",c.loop&&(0>a&&(a=c.group.length+a%c.group.length),a%=c.group.length),c.group[a]!==v&&(b.cancel(),b._start(a)))},reposition:function(a,d){var e=b.current,c=e?e.wrap:null,k;c&&(k=b._getPosition(d),a&&"scroll"===a.type?(delete k.position,c.stop(!0,!0).animate(k,200)):(c.css(k),e.pos=f.extend({},e.dim,k)))},update:function(a){var d=
a&&a.type,e=!d||"orientationchange"===d;e&&(clearTimeout(B),B=null);b.isOpen&&!B&&(B=setTimeout(function(){var c=b.current;c&&!b.isClosing&&(b.wrap.removeClass("fancybox-tmp"),(e||"load"===d||"resize"===d&&c.autoResize)&&b._setDimension(),"scroll"===d&&c.canShrink||b.reposition(a),b.trigger("onUpdate"),B=null)},e&&!s?0:300))},toggle:function(a){b.isOpen&&(b.current.fitToView="boolean"===f.type(a)?a:!b.current.fitToView,s&&(b.wrap.removeAttr("style").addClass("fancybox-tmp"),b.trigger("onUpdate")),
b.update())},hideLoading:function(){p.unbind(".loading");f("#fancybox-loading").remove()},showLoading:function(){var a,d;b.hideLoading();a=f('<div id="fancybox-loading"><div></div></div>').click(b.cancel).appendTo("body");p.bind("keydown.loading",function(a){if(27===(a.which||a.keyCode))a.preventDefault(),b.cancel()});b.defaults.fixed||(d=b.getViewport(),a.css({position:"absolute",top:0.5*d.h+d.y,left:0.5*d.w+d.x}))},getViewport:function(){var a=b.current&&b.current.locked||!1,d={x:n.scrollLeft(),
y:n.scrollTop()};a?(d.w=a[0].clientWidth,d.h=a[0].clientHeight):(d.w=s&&r.innerWidth?r.innerWidth:n.width(),d.h=s&&r.innerHeight?r.innerHeight:n.height());return d},unbindEvents:function(){b.wrap&&t(b.wrap)&&b.wrap.unbind(".fb");p.unbind(".fb");n.unbind(".fb")},bindEvents:function(){var a=b.current,d;a&&(n.bind("orientationchange.fb"+(s?"":" resize.fb")+(a.autoCenter&&!a.locked?" scroll.fb":""),b.update),(d=a.keys)&&p.bind("keydown.fb",function(e){var c=e.which||e.keyCode,k=e.target||e.srcElement;
if(27===c&&b.coming)return!1;!e.ctrlKey&&(!e.altKey&&!e.shiftKey&&!e.metaKey&&(!k||!k.type&&!f(k).is("[contenteditable]")))&&f.each(d,function(d,k){if(1<a.group.length&&k[c]!==v)return b[d](k[c]),e.preventDefault(),!1;if(-1<f.inArray(c,k))return b[d](),e.preventDefault(),!1})}),f.fn.mousewheel&&a.mouseWheel&&b.wrap.bind("mousewheel.fb",function(d,c,k,g){for(var h=f(d.target||null),j=!1;h.length&&!j&&!h.is(".fancybox-skin")&&!h.is(".fancybox-wrap");)j=h[0]&&!(h[0].style.overflow&&"hidden"===h[0].style.overflow)&&
(h[0].clientWidth&&h[0].scrollWidth>h[0].clientWidth||h[0].clientHeight&&h[0].scrollHeight>h[0].clientHeight),h=f(h).parent();if(0!==c&&!j&&1<b.group.length&&!a.canShrink){if(0<g||0<k)b.prev(0<g?"down":"left");else if(0>g||0>k)b.next(0>g?"up":"right");d.preventDefault()}}))},trigger:function(a,d){var e,c=d||b.coming||b.current;if(c){f.isFunction(c[a])&&(e=c[a].apply(c,Array.prototype.slice.call(arguments,1)));if(!1===e)return!1;c.helpers&&f.each(c.helpers,function(d,e){if(e&&b.helpers[d]&&f.isFunction(b.helpers[d][a]))b.helpers[d][a](f.extend(!0,
{},b.helpers[d].defaults,e),c)});p.trigger(a)}},isImage:function(a){return q(a)&&a.match(/(^data:image\/.*,)|(\.(jp(e|g|eg)|gif|png|bmp|webp|svg)((\?|#).*)?$)/i)},isSWF:function(a){return q(a)&&a.match(/\.(swf)((\?|#).*)?$/i)},_start:function(a){var d={},e,c;a=l(a);e=b.group[a]||null;if(!e)return!1;d=f.extend(!0,{},b.opts,e);e=d.margin;c=d.padding;"number"===f.type(e)&&(d.margin=[e,e,e,e]);"number"===f.type(c)&&(d.padding=[c,c,c,c]);d.modal&&f.extend(!0,d,{closeBtn:!1,closeClick:!1,nextClick:!1,arrows:!1,
mouseWheel:!1,keys:null,helpers:{overlay:{closeClick:!1}}});d.autoSize&&(d.autoWidth=d.autoHeight=!0);"auto"===d.width&&(d.autoWidth=!0);"auto"===d.height&&(d.autoHeight=!0);d.group=b.group;d.index=a;b.coming=d;if(!1===b.trigger("beforeLoad"))b.coming=null;else{c=d.type;e=d.href;if(!c)return b.coming=null,b.current&&b.router&&"jumpto"!==b.router?(b.current.index=a,b[b.router](b.direction)):!1;b.isActive=!0;if("image"===c||"swf"===c)d.autoHeight=d.autoWidth=!1,d.scrolling="visible";"image"===c&&(d.aspectRatio=
!0);"iframe"===c&&s&&(d.scrolling="scroll");d.wrap=f(d.tpl.wrap).addClass("fancybox-"+(s?"mobile":"desktop")+" fancybox-type-"+c+" fancybox-tmp "+d.wrapCSS).appendTo(d.parent||"body");f.extend(d,{skin:f(".fancybox-skin",d.wrap),outer:f(".fancybox-outer",d.wrap),inner:f(".fancybox-inner",d.wrap)});f.each(["Top","Right","Bottom","Left"],function(a,b){d.skin.css("padding"+b,w(d.padding[a]))});b.trigger("onReady");if("inline"===c||"html"===c){if(!d.content||!d.content.length)return b._error("content")}else if(!e)return b._error("href");
"image"===c?b._loadImage():"ajax"===c?b._loadAjax():"iframe"===c?b._loadIframe():b._afterLoad()}},_error:function(a){f.extend(b.coming,{type:"html",autoWidth:!0,autoHeight:!0,minWidth:0,minHeight:0,scrolling:"no",hasError:a,content:b.coming.tpl.error});b._afterLoad()},_loadImage:function(){var a=b.imgPreload=new Image;a.onload=function(){this.onload=this.onerror=null;b.coming.width=this.width/b.opts.pixelRatio;b.coming.height=this.height/b.opts.pixelRatio;b._afterLoad()};a.onerror=function(){this.onload=
this.onerror=null;b._error("image")};a.src=b.coming.href;!0!==a.complete&&b.showLoading()},_loadAjax:function(){var a=b.coming;b.showLoading();b.ajaxLoad=f.ajax(f.extend({},a.ajax,{url:a.href,error:function(a,e){b.coming&&"abort"!==e?b._error("ajax",a):b.hideLoading()},success:function(d,e){"success"===e&&(a.content=d,b._afterLoad())}}))},_loadIframe:function(){var a=b.coming,d=f(a.tpl.iframe.replace(/\{rnd\}/g,(new Date).getTime())).attr("scrolling",s?"auto":a.iframe.scrolling).attr("src",a.href);
f(a.wrap).bind("onReset",function(){try{f(this).find("iframe").hide().attr("src","//about:blank").end().empty()}catch(a){}});a.iframe.preload&&(b.showLoading(),d.one("load",function(){f(this).data("ready",1);s||f(this).bind("load.fb",b.update);f(this).parents(".fancybox-wrap").width("100%").removeClass("fancybox-tmp").show();b._afterLoad()}));a.content=d.appendTo(a.inner);a.iframe.preload||b._afterLoad()},_preloadImages:function(){var a=b.group,d=b.current,e=a.length,c=d.preload?Math.min(d.preload,
e-1):0,f,g;for(g=1;g<=c;g+=1)f=a[(d.index+g)%e],"image"===f.type&&f.href&&((new Image).src=f.href)},_afterLoad:function(){var a=b.coming,d=b.current,e,c,k,g,h;b.hideLoading();if(a&&!1!==b.isActive)if(!1===b.trigger("afterLoad",a,d))a.wrap.stop(!0).trigger("onReset").remove(),b.coming=null;else{d&&(b.trigger("beforeChange",d),d.wrap.stop(!0).removeClass("fancybox-opened").find(".fancybox-item, .fancybox-nav").remove());b.unbindEvents();e=a.content;c=a.type;k=a.scrolling;f.extend(b,{wrap:a.wrap,skin:a.skin,
outer:a.outer,inner:a.inner,current:a,previous:d});g=a.href;switch(c){case "inline":case "ajax":case "html":a.selector?e=f("<div>").html(e).find(a.selector):t(e)&&(e.data("fancybox-placeholder")||e.data("fancybox-placeholder",f('<div class="fancybox-placeholder"></div>').insertAfter(e).hide()),e=e.show().detach(),a.wrap.bind("onReset",function(){f(this).find(e).length&&e.hide().replaceAll(e.data("fancybox-placeholder")).data("fancybox-placeholder",!1)}));break;case "image":e=a.tpl.image.replace("{href}",
g);break;case "swf":e='<object id="fancybox-swf" classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000" width="100%" height="100%"><param name="movie" value="'+g+'"></param>',h="",f.each(a.swf,function(a,b){e+='<param name="'+a+'" value="'+b+'"></param>';h+=" "+a+'="'+b+'"'}),e+='<embed src="'+g+'" type="application/x-shockwave-flash" width="100%" height="100%"'+h+"></embed></object>"}(!t(e)||!e.parent().is(a.inner))&&a.inner.append(e);b.trigger("beforeShow");a.inner.css("overflow","yes"===k?"scroll":
"no"===k?"hidden":k);b._setDimension();b.reposition();b.isOpen=!1;b.coming=null;b.bindEvents();if(b.isOpened){if(d.prevMethod)b.transitions[d.prevMethod]()}else f(".fancybox-wrap").not(a.wrap).stop(!0).trigger("onReset").remove();b.transitions[b.isOpened?a.nextMethod:a.openMethod]();b._preloadImages()}},_setDimension:function(){var a=b.getViewport(),d=0,e=!1,c=!1,e=b.wrap,k=b.skin,g=b.inner,h=b.current,c=h.width,j=h.height,m=h.minWidth,u=h.minHeight,n=h.maxWidth,p=h.maxHeight,s=h.scrolling,q=h.scrollOutside?
h.scrollbarWidth:0,x=h.margin,y=l(x[1]+x[3]),r=l(x[0]+x[2]),v,z,t,C,A,F,B,D,H;e.add(k).add(g).width("auto").height("auto").removeClass("fancybox-tmp");x=l(k.outerWidth(!0)-k.width());v=l(k.outerHeight(!0)-k.height());z=y+x;t=r+v;C=E(c)?(a.w-z)*l(c)/100:c;A=E(j)?(a.h-t)*l(j)/100:j;if("iframe"===h.type){if(H=h.content,h.autoHeight&&1===H.data("ready"))try{H[0].contentWindow.document.location&&(g.width(C).height(9999),F=H.contents().find("body"),q&&F.css("overflow-x","hidden"),A=F.outerHeight(!0))}catch(G){}}else if(h.autoWidth||
h.autoHeight)g.addClass("fancybox-tmp"),h.autoWidth||g.width(C),h.autoHeight||g.height(A),h.autoWidth&&(C=g.width()),h.autoHeight&&(A=g.height()),g.removeClass("fancybox-tmp");c=l(C);j=l(A);D=C/A;m=l(E(m)?l(m,"w")-z:m);n=l(E(n)?l(n,"w")-z:n);u=l(E(u)?l(u,"h")-t:u);p=l(E(p)?l(p,"h")-t:p);F=n;B=p;h.fitToView&&(n=Math.min(a.w-z,n),p=Math.min(a.h-t,p));z=a.w-y;r=a.h-r;h.aspectRatio?(c>n&&(c=n,j=l(c/D)),j>p&&(j=p,c=l(j*D)),c<m&&(c=m,j=l(c/D)),j<u&&(j=u,c=l(j*D))):(c=Math.max(m,Math.min(c,n)),h.autoHeight&&
"iframe"!==h.type&&(g.width(c),j=g.height()),j=Math.max(u,Math.min(j,p)));if(h.fitToView)if(g.width(c).height(j),e.width(c+x),a=e.width(),y=e.height(),h.aspectRatio)for(;(a>z||y>r)&&(c>m&&j>u)&&!(19<d++);)j=Math.max(u,Math.min(p,j-10)),c=l(j*D),c<m&&(c=m,j=l(c/D)),c>n&&(c=n,j=l(c/D)),g.width(c).height(j),e.width(c+x),a=e.width(),y=e.height();else c=Math.max(m,Math.min(c,c-(a-z))),j=Math.max(u,Math.min(j,j-(y-r)));q&&("auto"===s&&j<A&&c+x+q<z)&&(c+=q);g.width(c).height(j);e.width(c+x);a=e.width();
y=e.height();e=(a>z||y>r)&&c>m&&j>u;c=h.aspectRatio?c<F&&j<B&&c<C&&j<A:(c<F||j<B)&&(c<C||j<A);f.extend(h,{dim:{width:w(a),height:w(y)},origWidth:C,origHeight:A,canShrink:e,canExpand:c,wPadding:x,hPadding:v,wrapSpace:y-k.outerHeight(!0),skinSpace:k.height()-j});!H&&(h.autoHeight&&j>u&&j<p&&!c)&&g.height("auto")},_getPosition:function(a){var d=b.current,e=b.getViewport(),c=d.margin,f=b.wrap.width()+c[1]+c[3],g=b.wrap.height()+c[0]+c[2],c={position:"absolute",top:c[0],left:c[3]};d.autoCenter&&d.fixed&&
!a&&g<=e.h&&f<=e.w?c.position="fixed":d.locked||(c.top+=e.y,c.left+=e.x);c.top=w(Math.max(c.top,c.top+(e.h-g)*d.topRatio));c.left=w(Math.max(c.left,c.left+(e.w-f)*d.leftRatio));return c},_afterZoomIn:function(){var a=b.current;a&&(b.isOpen=b.isOpened=!0,b.wrap.css("overflow","visible").addClass("fancybox-opened"),b.update(),(a.closeClick||a.nextClick&&1<b.group.length)&&b.inner.css("cursor","pointer").bind("click.fb",function(d){!f(d.target).is("a")&&!f(d.target).parent().is("a")&&(d.preventDefault(),
b[a.closeClick?"close":"next"]())}),a.closeBtn&&f(a.tpl.closeBtn).appendTo(b.skin).bind("click.fb",function(a){a.preventDefault();b.close()}),a.arrows&&1<b.group.length&&((a.loop||0<a.index)&&f(a.tpl.prev).appendTo(b.outer).bind("click.fb",b.prev),(a.loop||a.index<b.group.length-1)&&f(a.tpl.next).appendTo(b.outer).bind("click.fb",b.next)),b.trigger("afterShow"),!a.loop&&a.index===a.group.length-1?b.play(!1):b.opts.autoPlay&&!b.player.isActive&&(b.opts.autoPlay=!1,b.play()))},_afterZoomOut:function(a){a=
a||b.current;f(".fancybox-wrap").trigger("onReset").remove();f.extend(b,{group:{},opts:{},router:!1,current:null,isActive:!1,isOpened:!1,isOpen:!1,isClosing:!1,wrap:null,skin:null,outer:null,inner:null});b.trigger("afterClose",a)}});b.transitions={getOrigPosition:function(){var a=b.current,d=a.element,e=a.orig,c={},f=50,g=50,h=a.hPadding,j=a.wPadding,m=b.getViewport();!e&&(a.isDom&&d.is(":visible"))&&(e=d.find("img:first"),e.length||(e=d));t(e)?(c=e.offset(),e.is("img")&&(f=e.outerWidth(),g=e.outerHeight())):
(c.top=m.y+(m.h-g)*a.topRatio,c.left=m.x+(m.w-f)*a.leftRatio);if("fixed"===b.wrap.css("position")||a.locked)c.top-=m.y,c.left-=m.x;return c={top:w(c.top-h*a.topRatio),left:w(c.left-j*a.leftRatio),width:w(f+j),height:w(g+h)}},step:function(a,d){var e,c,f=d.prop;c=b.current;var g=c.wrapSpace,h=c.skinSpace;if("width"===f||"height"===f)e=d.end===d.start?1:(a-d.start)/(d.end-d.start),b.isClosing&&(e=1-e),c="width"===f?c.wPadding:c.hPadding,c=a-c,b.skin[f](l("width"===f?c:c-g*e)),b.inner[f](l("width"===
f?c:c-g*e-h*e))},zoomIn:function(){var a=b.current,d=a.pos,e=a.openEffect,c="elastic"===e,k=f.extend({opacity:1},d);delete k.position;c?(d=this.getOrigPosition(),a.openOpacity&&(d.opacity=0.1)):"fade"===e&&(d.opacity=0.1);b.wrap.css(d).animate(k,{duration:"none"===e?0:a.openSpeed,easing:a.openEasing,step:c?this.step:null,complete:b._afterZoomIn})},zoomOut:function(){var a=b.current,d=a.closeEffect,e="elastic"===d,c={opacity:0.1};e&&(c=this.getOrigPosition(),a.closeOpacity&&(c.opacity=0.1));b.wrap.animate(c,
{duration:"none"===d?0:a.closeSpeed,easing:a.closeEasing,step:e?this.step:null,complete:b._afterZoomOut})},changeIn:function(){var a=b.current,d=a.nextEffect,e=a.pos,c={opacity:1},f=b.direction,g;e.opacity=0.1;"elastic"===d&&(g="down"===f||"up"===f?"top":"left","down"===f||"right"===f?(e[g]=w(l(e[g])-200),c[g]="+=200px"):(e[g]=w(l(e[g])+200),c[g]="-=200px"));"none"===d?b._afterZoomIn():b.wrap.css(e).animate(c,{duration:a.nextSpeed,easing:a.nextEasing,complete:b._afterZoomIn})},changeOut:function(){var a=
b.previous,d=a.prevEffect,e={opacity:0.1},c=b.direction;"elastic"===d&&(e["down"===c||"up"===c?"top":"left"]=("up"===c||"left"===c?"-":"+")+"=200px");a.wrap.animate(e,{duration:"none"===d?0:a.prevSpeed,easing:a.prevEasing,complete:function(){f(this).trigger("onReset").remove()}})}};b.helpers.overlay={defaults:{closeClick:!0,speedOut:200,showEarly:!0,css:{},locked:!s,fixed:!0},overlay:null,fixed:!1,el:f("html"),create:function(a){a=f.extend({},this.defaults,a);this.overlay&&this.close();this.overlay=
f('<div class="fancybox-overlay"></div>').appendTo(b.coming?b.coming.parent:a.parent);this.fixed=!1;a.fixed&&b.defaults.fixed&&(this.overlay.addClass("fancybox-overlay-fixed"),this.fixed=!0)},open:function(a){var d=this;a=f.extend({},this.defaults,a);this.overlay?this.overlay.unbind(".overlay").width("auto").height("auto"):this.create(a);this.fixed||(n.bind("resize.overlay",f.proxy(this.update,this)),this.update());a.closeClick&&this.overlay.bind("click.overlay",function(a){if(f(a.target).hasClass("fancybox-overlay"))return b.isActive?
b.close():d.close(),!1});this.overlay.css(a.css).show()},close:function(){var a,b;n.unbind("resize.overlay");this.el.hasClass("fancybox-lock")&&(f(".fancybox-margin").removeClass("fancybox-margin"),a=n.scrollTop(),b=n.scrollLeft(),this.el.removeClass("fancybox-lock"),n.scrollTop(a).scrollLeft(b));f(".fancybox-overlay").remove().hide();f.extend(this,{overlay:null,fixed:!1})},update:function(){var a="100%",b;this.overlay.width(a).height("100%");I?(b=Math.max(G.documentElement.offsetWidth,G.body.offsetWidth),
p.width()>b&&(a=p.width())):p.width()>n.width()&&(a=p.width());this.overlay.width(a).height(p.height())},onReady:function(a,b){var e=this.overlay;f(".fancybox-overlay").stop(!0,!0);e||this.create(a);a.locked&&(this.fixed&&b.fixed)&&(e||(this.margin=p.height()>n.height()?f("html").css("margin-right").replace("px",""):!1),b.locked=this.overlay.append(b.wrap),b.fixed=!1);!0===a.showEarly&&this.beforeShow.apply(this,arguments)},beforeShow:function(a,b){var e,c;b.locked&&(!1!==this.margin&&(f("*").filter(function(){return"fixed"===
f(this).css("position")&&!f(this).hasClass("fancybox-overlay")&&!f(this).hasClass("fancybox-wrap")}).addClass("fancybox-margin"),this.el.addClass("fancybox-margin")),e=n.scrollTop(),c=n.scrollLeft(),this.el.addClass("fancybox-lock"),n.scrollTop(e).scrollLeft(c));this.open(a)},onUpdate:function(){this.fixed||this.update()},afterClose:function(a){this.overlay&&!b.coming&&this.overlay.fadeOut(a.speedOut,f.proxy(this.close,this))}};b.helpers.title={defaults:{type:"float",position:"bottom"},beforeShow:function(a){var d=
b.current,e=d.title,c=a.type;f.isFunction(e)&&(e=e.call(d.element,d));if(q(e)&&""!==f.trim(e)){d=f('<div class="fancybox-title fancybox-title-'+c+'-wrap">'+e+"</div>");switch(c){case "inside":c=b.skin;break;case "outside":c=b.wrap;break;case "over":c=b.inner;break;default:c=b.skin,d.appendTo("body"),I&&d.width(d.width()),d.wrapInner('<span class="child"></span>'),b.current.margin[2]+=Math.abs(l(d.css("margin-bottom")))}d["top"===a.position?"prependTo":"appendTo"](c)}}};f.fn.fancybox=function(a){var d,
e=f(this),c=this.selector||"",k=function(g){var h=f(this).blur(),j=d,k,l;!g.ctrlKey&&(!g.altKey&&!g.shiftKey&&!g.metaKey)&&!h.is(".fancybox-wrap")&&(k=a.groupAttr||"data-fancybox-group",l=h.attr(k),l||(k="rel",l=h.get(0)[k]),l&&(""!==l&&"nofollow"!==l)&&(h=c.length?f(c):e,h=h.filter("["+k+'="'+l+'"]'),j=h.index(this)),a.index=j,!1!==b.open(h,a)&&g.preventDefault())};a=a||{};d=a.index||0;!c||!1===a.live?e.unbind("click.fb-start").bind("click.fb-start",k):p.undelegate(c,"click.fb-start").delegate(c+
":not('.fancybox-item, .fancybox-nav')","click.fb-start",k);this.filter("[data-fancybox-start=1]").trigger("click");return this};p.ready(function(){var a,d;f.scrollbarWidth===v&&(f.scrollbarWidth=function(){var a=f('<div style="width:50px;height:50px;overflow:auto"><div/></div>').appendTo("body"),b=a.children(),b=b.innerWidth()-b.height(99).innerWidth();a.remove();return b});if(f.support.fixedPosition===v){a=f.support;d=f('<div style="position:fixed;top:20px;"></div>').appendTo("body");var e=20===
d[0].offsetTop||15===d[0].offsetTop;d.remove();a.fixedPosition=e}f.extend(b.defaults,{scrollbarWidth:f.scrollbarWidth(),fixed:f.support.fixedPosition,parent:f("body")});a=f(r).width();J.addClass("fancybox-lock-test");d=f(r).width();J.removeClass("fancybox-lock-test");f("<style type='text/css'>.fancybox-margin{margin-right:"+(d-a)+"px;}</style>").appendTo("head")})})(window,document,jQuery);
/*!
 * Media helper for fancyBox
 * version: 1.0.6 (Fri, 14 Jun 2013)
 * @requires fancyBox v2.0 or later
 *
 * Usage:
 *     $(".fancybox").fancybox({
 *         helpers : {
 *             media: true
 *         }
 *     });
 *
 * Set custom URL parameters:
 *     $(".fancybox").fancybox({
 *         helpers : {
 *             media: {
 *                 youtube : {
 *                     params : {
 *                         autoplay : 0
 *                     }
 *                 }
 *             }
 *         }
 *     });
 *
 * Or:
 *     $(".fancybox").fancybox({,
 *         helpers : {
 *             media: true
 *         },
 *         youtube : {
 *             autoplay: 0
 *         }
 *     });
 *
 *  Supports:
 *
 *      Youtube
 *          http://www.youtube.com/watch?v=opj24KnzrWo
 *          http://www.youtube.com/embed/opj24KnzrWo
 *          http://youtu.be/opj24KnzrWo
 *			http://www.youtube-nocookie.com/embed/opj24KnzrWo
 *      Vimeo
 *          http://vimeo.com/40648169
 *          http://vimeo.com/channels/staffpicks/38843628
 *          http://vimeo.com/groups/surrealism/videos/36516384
 *          http://player.vimeo.com/video/45074303
 *      Metacafe
 *          http://www.metacafe.com/watch/7635964/dr_seuss_the_lorax_movie_trailer/
 *          http://www.metacafe.com/watch/7635964/
 *      Dailymotion
 *          http://www.dailymotion.com/video/xoytqh_dr-seuss-the-lorax-premiere_people
 *      Twitvid
 *          http://twitvid.com/QY7MD
 *      Twitpic
 *          http://twitpic.com/7p93st
 *      Instagram
 *          http://instagr.am/p/IejkuUGxQn/
 *          http://instagram.com/p/IejkuUGxQn/
 *      Google maps
 *          http://maps.google.com/maps?q=Eiffel+Tower,+Avenue+Gustave+Eiffel,+Paris,+France&t=h&z=17
 *          http://maps.google.com/?ll=48.857995,2.294297&spn=0.007666,0.021136&t=m&z=16
 *          http://maps.google.com/?ll=48.859463,2.292626&spn=0.000965,0.002642&t=m&z=19&layer=c&cbll=48.859524,2.292532&panoid=YJ0lq28OOy3VT2IqIuVY0g&cbp=12,151.58,,0,-15.56
 */

(function ($) {
	"use strict";

	//Shortcut for fancyBox object
	var F = $.fancybox,
		format = function( url, rez, params ) {
			params = params || '';

			if ( $.type( params ) === "object" ) {
				params = $.param(params, true);
			}

			$.each(rez, function(key, value) {
				url = url.replace( '$' + key, value || '' );
			});

			if (params.length) {
				url += ( url.indexOf('?') > 0 ? '&' : '?' ) + params;
			}

			return url;
		};

	//Add helper object
	F.helpers.media = {
		defaults : {
			youtube : {
				matcher : /(youtube\.com|youtu\.be|youtube-nocookie\.com)\/(watch\?v=|v\/|u\/|embed\/?)?(videoseries\?list=(.*)|[\w-]{11}|\?listType=(.*)&list=(.*)).*/i,
				params  : {
					autoplay    : 1,
					autohide    : 1,
					fs          : 1,
					rel         : 0,
					hd          : 1,
					wmode       : 'opaque',
					enablejsapi : 1
				},
				type : 'iframe',
				url  : '//www.youtube.com/embed/$3'
			},
			vimeo : {
				matcher : /(?:vimeo(?:pro)?.com)\/(?:[^\d]+)?(\d+)(?:.*)/,
				params  : {
					autoplay      : 1,
					hd            : 1,
					show_title    : 1,
					show_byline   : 1,
					show_portrait : 0,
					fullscreen    : 1
				},
				type : 'iframe',
				url  : '//player.vimeo.com/video/$1'
			},
			metacafe : {
				matcher : /metacafe.com\/(?:watch|fplayer)\/([\w\-]{1,10})/,
				params  : {
					autoPlay : 'yes'
				},
				type : 'swf',
				url  : function( rez, params, obj ) {
					obj.swf.flashVars = 'playerVars=' + $.param( params, true );

					return '//www.metacafe.com/fplayer/' + rez[1] + '/.swf';
				}
			},
			dailymotion : {
				matcher : /dailymotion.com\/video\/(.*)\/?(.*)/,
				params  : {
					additionalInfos : 0,
					autoStart : 1
				},
				type : 'swf',
				url  : '//www.dailymotion.com/swf/video/$1'
			},
			twitvid : {
				matcher : /twitvid\.com\/([a-zA-Z0-9_\-\?\=]+)/i,
				params  : {
					autoplay : 0
				},
				type : 'iframe',
				url  : '//www.twitvid.com/embed.php?guid=$1'
			},
			twitpic : {
				matcher : /twitpic\.com\/(?!(?:place|photos|events)\/)([a-zA-Z0-9\?\=\-]+)/i,
				type : 'image',
				url  : '//twitpic.com/show/full/$1/'
			},
			instagram : {
				matcher : /(instagr\.am|instagram\.com)\/p\/([a-zA-Z0-9_\-]+)\/?/i,
				type : 'image',
				url  : '//$1/p/$2/media/?size=l'
			},
			google_maps : {
				matcher : /maps\.google\.([a-z]{2,3}(\.[a-z]{2})?)\/(\?ll=|maps\?)(.*)/i,
				type : 'iframe',
				url  : function( rez ) {
					return '//maps.google.' + rez[1] + '/' + rez[3] + '' + rez[4] + '&output=' + (rez[4].indexOf('layer=c') > 0 ? 'svembed' : 'embed');
				}
			}
		},

		beforeLoad : function(opts, obj) {
			var url   = obj.href || '',
				type  = false,
				what,
				item,
				rez,
				params;

			for (what in opts) {
				if (opts.hasOwnProperty(what)) {
					item = opts[ what ];
					rez  = url.match( item.matcher );

					if (rez) {
						type   = item.type;
						params = $.extend(true, {}, item.params, obj[ what ] || ($.isPlainObject(opts[ what ]) ? opts[ what ].params : null));

						url = $.type( item.url ) === "function" ? item.url.call( this, rez, params, obj ) : format( item.url, rez, params );

						break;
					}
				}
			}

			if (type) {
				obj.href = url;
				obj.type = type;

				obj.autoHeight = false;
			}
		}
	};

}(jQuery));
// !PLUGIN
// Mimics window scroll position usefull to show milestones
!function( $ ) {

	"use strict"

	/* SCROLLMAP PUBLIC CLASS DEFINITION
	* ============================== */

	var Scrollmilestones = function(element, options) {

		this.$element = $(element)
		this.options = $.extend({}, $.fn.scrollmilestones.defaults, options, this.$element.data())
		this.milestones = [];
		this.milestoneLine = $(this.options.lineTemplate).prependTo(this.$element);
		this.milestoneIndicator = $(this.options.indicatorTemplate).appendTo(this.milestoneLine);
		this.currentMilestone = 0;
		this.ready = false;

		if(this.options.initOnLoad){
			$(window).on("load", $.proxy(this.init, this))
		}else{
			this.init()
		}

		$(window).on("scroll", $.proxy(this.onScroll, this));

	}

	Scrollmilestones.prototype = {
		constructor: Scrollmilestones,
		// Get the Dom coordinated of the reference DOMs in place
		init: function(){
			var $self = this, left = 0,
				$items = this.$milestones = this.$element.find(this.options.milestoneSelector);

			$.each($items, function(i, item){
				var content = $($(item).attr("href")), top = content.position().top;
				
				$self.milestones.push(top);

				if(i == 0){
					left = $self.domCenterX($(item).parent());
					$self.milestoneLine.css("left", left);
					$self.firstStone = top + $self.options.offset;
				}

				if(i == $items.length - 1){ 
					$self.milestoneLine.width($self.domCenterX($(item).parent()) - left);
					$self.lastStone = top + $self.options.offset;
				}
			})

			this.lineWidth = this.milestoneLine.innerWidth();

			this.milestoneSize = this.milestones.length;

			this.ready = true;

			this.onScroll();
		},

		windowTop: function(){
			return $(window).scrollTop() + this.options.offset;
		},

		onScroll: function(){
			// Check if the plugin is ready to track points
			if(!this.ready) return;

			// Setting milestone position to -1 if the window pos is lesser than the prime stone
			if(this.windowTop() < this.firstStone){
				this.currentMilestone = -1
			}else{
				var milestonePos = (this.windowTop() > this.lastStone) ? 
									this.lineWidth : this.normalize(0, this.relativePoint(), this.lineWidth)	
				this.milestoneIndicator.css("left", milestonePos);
			}
			
			this.$milestones.parent()
				.removeClass("inactive active")
				.eq(this.currentMilestone).addClass("active")

			this.$milestones.slice(0, Math.max(0, this.currentMilestone)).parent().addClass("inactive")
		},

		domCenterX: function(dom){
			return(dom.width()/2 + dom.offset().left)
		},

		normalize: function(a, x, b){
 		   return(Math.min(Math.max(a, x), b));
		},

		relativePoint: function(){
			for(var i = 0; i < this.milestones.length; i++){
				this.currentMilestone = i
				this.getPointOnVertical()

				if(this.relativePosition < 1) break;
			}

			return this.pointOnHorizontal()
		},

		// Calculate the point on the horizontal scroll window relative to the milestone content height
		// This will return a value between 0 & 1
		pointOnHorizontal: function(){
			var h = this.lineWidth/(this.milestoneSize-1), 
				l = this.currentMilestone * h;

			return((this.relativePosition * ((l + h) - l)) + l);
		},

		getPointOnVertical: function(){
			var i = this.currentMilestone;

			this.relativePosition = (this.windowTop() - this.milestones[i])/(this.milestones[i+1] - this.milestones[i]);

			return(this.relativePosition)
		}
	}

	/* SCROLLMAP PLUGIN DEFINITION
	* ======================= */

	$.fn.scrollmilestones = function (option) {
		return this.each(function () {			
			var $this = $(this)
			, data = $this.data('scrollmilestones')
			, options = typeof option == 'object' && option

			if (!data) $this.data('scrollmilestones', (data = new Scrollmilestones(this, options)))

			if (typeof option == 'string') data[option]()
		})
	}

	$.fn.scrollmilestones.defaults = {
		milestoneSelector: "a",
		indicatorTemplate: "<i class='milestone-indicator'></i>",
		lineTemplate: "<i class='milestone-line'></i>",
		offset: 200, 
		initOnLoad: true 
	}

	$.fn.scrollmilestones.Constructor = Scrollmilestones
	

}(window.jQuery);
window['LITERALS'] = {
	'default' : {
		messages:{
			"user[first_name]"  : {
				required: "First name field is required"
			},
			"user[last_name]"  : {
				required: "Last name field is required"
			},
			"account[name]"  : {
				required: "You'll need to tell us where you work",
				minlength: "Company name should exceed 2 characters"
			},
			"account[domain]": {
				required: "Give your helpdesk a name",
				maxlength: "Helpdesk name shouldn't exceed 25 characters",
				subdomain:"Only letters, numbers and hyphen allowed"
			},
			"user[email]":{
				required: "Please enter a valid email",
				email:"Please enter a valid email"
			}
		},
		already_exists: 'This Helpdesk already exists',
		email_like:'This Helpdesk already exists',
		thankyoumsg:["Setting up your self service portal", 
					"Cranking up your knowledge base",
					"Configuring your Community Platform", "_redirect"]
	},
	br : {
		messages:{
			"account[name]"  : {
				required: "Você precisa nos dizer onde trabalha",
				minlength: "O nome da empresa deve ser superior a 2 caracteres"
			},
			"account[domain]": {
				required: "Dê um nome ao seu apoio técnico",
				maxlength: "O nome do apoio técnico não deve ser superior a 25 caracteres",
				subdomain:"Apenas letras, números e &#39;-&#39; são permitidos"
			},
			"user[email]":{
				required: "Informe um endereço de e-mail válido",
				email: "O e-mail deve ter a forma de um endereço de e-mail"
			}
		},
		already_exists: 'Esse apoio técnico já existe',
		email_like:"O e-mail deve ter a forma de um endereço de e-mail",
		thankyoumsg:["Configurar o seu portal de auto-atendimento", 
					"Acionando sua base de conhecimento",
					"Configurando sua Plataforma Comunidade", "_redirect"]
	},
	de : {
		messages:{
			"account[name]"  : {
				required: "Sie müssen uns sagen, wo Sie arbeiten ",
				minlength: "Der Firmenname sollte mehr als 2 Zeichen haben "
			},
			"account[domain]": {
				required: "Geben Sie Ihrem Helpdesk einen Namen",
				maxlength: "Der Helpdesk-Name sollte nicht mehr als 25 Zeichen haben",
				subdomain:"Nur Buchstaben, Zahlen und '-' erlaubt"
			},
			"user[email]":{
				required: "Bitte geben Sie eine gültige E-Mail-Adresse ein",
				email: "Die E-Mail sollte wie eine E-Mail-Adresse aussehen"
			}
		},
		already_exists: 'Dieser Helpdesk existiert bereits',
		email_like:'Die E-Mail sollte wie eine E-Mail-Adresse aussehen',
		thankyoumsg:["Einrichten Ihres Self-Service-Portal", 
					"Kurbelt Ihre Wissensbasis",
					"Konfigurieren Sie Ihre Community-Plattform", "_redirect"]
	},
	es : {
		messages:{
			"account[name]"  : {
				required: "Necesitará indicar dónde trabaja",
				minlength: "El nombre de la empresa debe tener al menos dos caracteres"
			},
			"account[domain]": {
				required: "Facilite el nombre de su equipo de asistencia técnica",
				maxlength: "El nombre del departamento técnico no debe exceder de 25 caracteres",
				subdomain:"Sólo se permiten letras, números y &#45;"
			},
			"user[email]":{
				required: "Por favor, introduzca una dirección de correo electrónico válida",
				email: "Por favor, introduzca una dirección de correo electrónico válida"
			}
		},
		already_exists: 'Este nombre de departamento técnico ya existe',
		email_like:'El correo electrónico debe completarse como una dirección de correo electrónico normal',
		thankyoumsg:["Configuración del portal de autoservicio", 
					"Poniendo encima de su base de conocimientos",
					"Configuración de la Plataforma Comunitaria", "_redirect"]
	},
	fr : {
		messages:{
			"account[name]"  : {
				required: "Vous devez nous dire où vous travaillez",
				minlength: "Le nom de la société doit faire plus de deux caractères"
			},
			"account[domain]": {
				required: "Donnez un nom à votre service d'assistance",
				maxlength: "Le nom du service d'assistance ne doit pas dépasser 25 caractères",
				subdomain:"Seuls sont autorisés les lettres, les nombres et « - »"
			},
			"user[email]":{
				required: "Veuillez entrer une adresse e-mail valide",
				email: "L&#39;adresse e-mail doit ressembler à une adresse e-mail"
			}
		},
		already_exists: 'Ce service d&#39;assistance existe déjà',
		email_like:'L&#39;adresse e-mail doit ressembler à une adresse e-mail',
		thankyoumsg:["Configuration de votre portail en self-service", 
					"Démarrage de votre base de connaissances",
					"Configuration de votre plate-forme communautaire", "_redirect"]
	},
	nl : {
		messages:{
			"account[name]"  : {
				required: "U moet ons vertellen waar u werkt",
				minlength: "Bedrijfsnaam moet uit meer dan 2 karakters bestaan"
			},
			"account[domain]": {
				required: "Geef uw helpdesk een naam",
				maxlength: "De naam van de helpdesk mag uit niet meer dan 25 tekens bestaan",
				subdomain:"Alleen letters, cijfers en &#39;-&#39; toegestaan"
			},
			"user[email]":{
				required: "Vul een geldig e-mailadres in",
				email: "E-mail moet er uitzien als een e-mailadres"
			}
		},
		already_exists: 'Deze helpdesk bestaat al',
		email_like:'E-mail moet er uitzien als een e-mailadres',
		thankyoumsg:["Het opzetten van uw self service portal", 
					"Zwengelen uw kennis",
					"Configureren van uw Gemeenschap Platform", "_redirect"]
	}
}
;
// no conflict check for jQuery
// $j = jQuery.noConflict();

// Error handling for console.log
if (typeof console === "undefined" || typeof console.log === "undefined") {
    console = { };
    console.log = function(){ };
};

function log() {
    var args = Array.prototype.slice.call(arguments);
    if (window.console && window.console.log && window.console.log.apply) {
        console.log(args.join(" "));
    } else {
        // alert(entry);
    }
};

function checkPlugin(name){
    return (jQuery()[name]) ? true : false
}

// Mobile checking utility inside javascript
var isMobile = {
    Android: function() {
        return navigator.userAgent.match(/Android/i);
    },
    BlackBerry: function() {
        return navigator.userAgent.match(/BlackBerry/i);
    },
    iOS: function() {
        return navigator.userAgent.match(/iPhone|iPad|iPod/i);
    },
    Opera: function() {
        return navigator.userAgent.match(/Opera Mini/i);
    },
    Windows: function() {
        return navigator.userAgent.match(/IEMobile/i);
    },
    any: function() {
        return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
    }
};

// Layout resize util for portal
function layoutResize(layoutClass1, layoutClass2){
    "use strict"
    var mainbar = $(layoutClass1).get(0),
        sidebar = $(layoutClass2).get(0)

    // If no sidebar is present make the main content to stretch to full-width
    if(!sidebar) $(mainbar).removeClass(layoutClass1.replace(/./, ""))

    // If no mainbar is present make the sidebar content to stretch to full-width
    if(!mainbar) $(sidebar).removeClass(layoutClass2.replace(/./, ""))

    // Setting equal height for main & sidebar if both are present
    if(!isMobile.any() && (mainbar || sidebar)){        
        $(layoutClass1 + ", " + layoutClass2)
            .css("minHeight", Math.max($(mainbar).outerHeight(true), $(sidebar).outerHeight(true)) + "px")
    }
}

// Getting a Query string
function getParameterByName(name){
  name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
  var regexS = "[\\?&]" + name + "=([^&#]*)";
  var regex = new RegExp(regexS);
  var results = regex.exec(window.location.search);
  if(results == null)
    return "";
  else
    return decodeURIComponent(results[1].replace(/\+/g, " "));
}
;
/*
 * @author venom
 * Site init page scripts
 */


!function( $ ) {

	layoutResize(".right-panel", ".left-panel")

	$(function () {

		"use strict"
		
		// Attaching dom ready events

		// Preventing default click & event handlers for disabled or active links
		$(".disabled")
			.on("click", function(ev){
				ev.preventDefault()
				ev.stopImmediatePropagation()
			});

		$('.sticky-header').waypoint('sticky');
		$('.sticky-sidebar').waypoint('sticky', {
			wrapper: '<div class="sticky-sidebar-wrapper" />',
			offset: "65px"
		});

		$('.tour-sticky').waypoint('sticky', {
			stickyStartCallback: function(sticky, direction) {
	        	if(direction === 'down'){
	        		setTimeout(function(){
	        			$("#scroll-panel").scrollmilestones({ initOnLoad: false })	
	        		}, 200);
	        	} 
	      	}
		});
		
		// Header menu active in Current page
		var pageid = page['cID'];
			
		// Freshdesk home page
		if(pageid == 597){
			$('.fd-home-sticky').attr('id','fd-home');
			$(".fresh-widgets").hide();
			$(".footer-strip").remove();
		}

		if (pageid == 1523) {
			$('.pricing-tab').addClass('active');
		};
		if (pageid == 414) {
			$('.resources-tab').addClass('active');
		};
		if (pageid == 1499) {
			$('.customers-tab').addClass('active');
		};
		if (pageid == 1277 ) {
			$('.product-tab').addClass('active');
		};
		if (pageid == 1519 || pageid == 1533 || pageid == 1534 || pageid == 1535 || pageid == 1536 || pageid == 1538 || pageid == 1537 || pageid == 1522 || pageid == 1291) {
			$('.feature-tab').addClass('active');
		};

		$("#signup .textfield input").on({ 
			focus: function(ev){
				$(this).parents(".textfield").addClass("active")
			},
			blur: function(ev){
				$(this).parents(".textfield").removeClass("active")
			}
		})

		$('.smoothscroll').smoothScroll({ offset: -130 })

		// Autoplay default init
		$(".fd-autoplay").fd_autoplay();

		$(".sub-menu li").on("click", function(ev){
			var link = $(this).find("a").first().attr("href");

			if(link){
				window.location = link;
			}
		});

		// FancyBox
		$('.fancybox').fancybox();
		$('.youtube-widget a, .slideshare-widget a, .banner-video .fancybox').click(function(evt) {
			evt.preventDefault();
			evt.stopPropagation();
			var href = $(this).attr('href');
			$.fancybox.open({
				href : href,
				type : 'iframe',
				padding : 5,
				arrows : false,
				helpers : {
					media : {},
				}
			});
		});

		$("a.inline_fancy, .inline-fancybox a").fancybox({
			'width': 450,
			'height': 550,
			'autoDimensions': false,
			'autoSize': false
		});

		// IE Specific classes
        if($.browser.msie) {
            if ($.browser.version.slice(0,1) === '7') {
                $('html').addClass('ie7');
            } else if ($.browser.version.slice(0,1) === '8') {
                $('html').addClass('ie8');
            } else if ($.browser.version.slice(0,1) === '9') {
                $('html').addClass('ie9');
            }
        }

        if(getParameterByName('submitted') == 'mobihelp') {
	 	   $('#details_form').trigger('click');
		}

		//Tour sticky DOM _construct [As per the tour nav(images & text) provided]
		var tourStickyNavs = new Array('chaos-to-control-icon','proactive-icon','scaling_up-icon','business_alignment-icon');
    	var tourStickyDom = jQuery('#tour_controls').html();
    	jQuery('.tour_sticky').append(tourStickyDom);
    	jQuery('.tour_sticky').find('li a').each(function(index){ jQuery(this).attr('id', tourStickyNavs[index]) });
    	
    	// $('.fd-tour-sticky').waypoint('sticky');
    	if($(window).width() >= 721) {
	    	$('.comparison-right-panel').waypoint('sticky',{
	    		// wrapper: '<div class="sticky-sidebar-wrapper" />',
	    		offset:"90px"
	    	});
	    	$('.comparison-desk').waypoint('sticky');
    	}
    	if($(window).width() <= 720) {

    		$('.price-comparison .sticky-sidebar').removeClass('sticky-sidebar');
    		$('.price-comparison .sticky-sidebar-wrapper .stuck').removeClass('stuck');

    		$('.mainimgwrapper').each(function(){

    			$(this).children(".movedownimg").appendTo(this);

    		});

    		$(".affiliate-commission").parent().parent().parent().css("margin-left","10%");
    		$(".affiliate-manager").parent().css("margin-left","10%");
    		$(".affiliate-manager").parent().css("text-align","left");


    	}

    	if($(window).width() <= 1025) {

    		$('.mainimgwrapper').each(function(){
    			$(this).children(".movedownimg").appendTo(this);
    		});

    		$('.company-logo-blocks .company-block').each(function(){
    			$(this).css("height",$(this).css("width"));
    		});

    	}

  

		$(document).on("pagecreate",function(){
  			$(".main").on("swipeleft",function(){

  				$(".slideshow_item").each(function(){

  					if($(this).css("display") != "none")
  					{
  					var prevurl = $(this).children(".tour-banner").children().children().children(".right-nav.next").attr("href");
					window.location.href = prevurl;
  					}
  						
  				});
  				
  			

  			});
  			$(".main").on("swiperight",function(){
				$(".slideshow_item").each(function(){
  					if($(this).css("display") != "none")
  					{
  					var nextvurl = $(this).children(".tour-banner").children().children().children(".left-nav.prev").attr("href");  				
					window.location.href = nextvurl;
				  	}  						
  				});
  			});                  
		});

			
    	//Responsive Scripts
    	if($(window).width() <= 1025) {
			$('.menu-icon').on("click", function(){
				$(".site-nav").slideToggle();
			});

			$(".site-nav a").removeClass("btn btn-mini btn-red").addClass("menu-item");

			$.each($(".banner-image"), function(i, item){
				$(item).appendTo($(item).parent());
			});	
			$('.site-nav li.menu-item-has-children').on("click",function(ev) {
		    	ev.preventDefault();
		    	$( ev.target ).siblings().slideToggle();
		    });
				
		}

		if ($(window).width() >= 980){
			$('.fd-tour-sticky,.fd-home-sticky,.fs-tour-sticky,.fd-page-sticky').waypoint('sticky');
			$('.tour-features-strip').waypoint('sticky');
			$('.menu-item-has-children .sub-menu').on('mouseenter mouseleave', function(){
        		$(this).siblings('.menu-item').toggleClass('active');
    		});
		}
		// footer dropdown for mobile 
		if ($(window).width() <= 720) {
			$('.fmenu li.fhead').on("click",function(ev) {

				if($(this).hasClass("active"))
				{
					$(this).removeClass('active');
					$(this).siblings().slideToggle();
				}
				else
				{
				$('.fmenu').find('li.fhead.active').removeClass('active').siblings().slideToggle();
				$(this).addClass('active');
		    	ev.preventDefault();
				$( ev.target ).siblings().slideToggle();		    	
		    	}

		    });
		    $('.footer-wrapper .parent2').prepend($('.f-contact')).prepend($('.footer-wrapper .parent2 .fg-4'));

			$.each($(".cust-info-box,.responsive-post,#signup-right-panel,.support-left-panel"), function(i, item){
				$(item).prependTo($(item).parent());
			});	
			$.each($(".landing-customer-info"), function(i, item){
				$(item).appendTo($(".landing-left-panel").parent());
			});

			$('.wrapper-dropdown').on("click", function(){
				$(".dropdown").slideToggle();
			});
		}

$(document).on("ready",function(){

	if ($(window).width() <= 720) {

		var navstripwidth = 0;

		$('.menuholder').css("width", $('.menucontainer').width()-60);
		$('.nav-tour-strip li').each(function(){
			navstripwidth = navstripwidth + $(this).width();		
		});
		$('.nav-tour-strip').css("width", navstripwidth+"px");

		try {
			if($('.nav-tour-strip.nav-pills li.active').index() != 1){
				$('.nav-pills').css("left", -(($('.nav-tour-strip.nav-pills li.active').index() - 1 ) * $('.nav-pills li').width()));
			}
		}
		catch(err) {
			var testmsg = err.message;
		}
		// mobile menu script for icon menus on desktop
		var maxcountlimit = Math.floor($('.nav-tour-strip').width()/ $('.menuholder').width()),
			slidelength = $('.menuholder').width() / 2,
			lvalue = 0,
			leftlength = 0;

		try {
			if($('.nav-tour-strip.nav-pills li.active').index() != 1){		
				lvalue = Math.floor(parseInt(-($('.nav-tour-strip').css("left").slice(0,-2)) / $('.menuholder').width()));
				leftlength = $('.nav-tour-strip').css("left").slice(0,-2);
			}
		}catch(err) {
			var testmsg = err.message;
		}

		$(".menuholder .rightmove").click(function(){
			var pos = $('.nav-tour-strip').position().left + $('.nav-tour-strip').width();
			if(pos > $(".menucontainer").width()){
				leftlength = parseInt(leftlength) - parseInt(slidelength);
				lvalue = lvalue + 1;				
				$(".nav-tour-strip").animate({ left: leftlength });
			}
		});

		$(".menuholder .leftmove").click(function(){			
			if($('.nav-tour-strip').position().left < 30){
				lvalue = lvalue - 1;
				leftlength = parseInt(leftlength) + parseInt(slidelength);
				if(leftlength>0)
				$(".nav-tour-strip").animate({ left: '0px'});									
				else
				$(".nav-tour-strip").animate({ left: leftlength});											
			}
		});

	}
});

	$(document).on('click','.fp-countries .fp-cr', function(event) {
	    event.preventDefault();
	    var target = "#" + this.getAttribute('data-target');
	    $('html, body').animate({
	        scrollTop: $(target).offset().top     
	    }, 2000);
	});

	// $('.team-inner-navbar li a').on('click', function() {

 //        var scrollPoint = ($(this).offset() || { "top": NaN }) .top+55;
 //        $('.team-inner-navbar li.active').removeClass('active');
 //        $(this).parent().addClass('active');

 //        // console.log(scrollPoint);
 //        // console.log('======|||=====')
 //        $('body,html').animate({
 //            scrollTop: scrollPoint
 //        }, 500);
        
 //        return false;
 //    });

	$('.fd-signup-form .textfield, form#signup .textfield').on('click keyup focus',function(){
			
			if($(this).hasClass('user_row')){
				$('.user_row').addClass('active');
			}else{
				$('.user_row').removeClass('active')
			}
	});

	$('.fd-signup-form .textfield.user_row input').on('blur',function(){

		if($('.user_row').hasClass('active')){
			$('.user_row').removeClass('active')
		}

	});

	$('form#signup .textfield.user_row input').on('blur',function(){

		if($('.user_row').hasClass('active')){
			$('.user_row').removeClass('active')
		}

	});
		
		$('.fd-signup-form .firstname #user_name').focus();

		if ($(window).width() <= 1040) {
			$('.fd-signup-form .user_row input').on('blur',function(){

				$('.user_row').each(function(){
					var userinput = $(this).children('input').val();
					if(userinput === ''){
					}else{
						$('.user_row').removeClass('error')
					}
				})

			});

			$('.fd-signup-form #signup_button').on('click blur focus',function(){
					setTimeout(function() {
	      				if ($('#error_container').hasClass("has_errors")){
						 		$('#error_container').hide();
						 	 	$('#signup_button').animate({
						            top: 50 + "px"
						        }, {
							     	duration: 400,
							     	complete: function(){
							     		$('#error_container').attr("style", "display: block !important");
							    	}
								});
						 }
					}, 500);

			});
		}
		
		$('.user_row input').on('focus',function(){
 			$('.user_row').addClass('active')
		});

		$('.fd-signup-form #signup_button').on('click blur focus',function(){

				if($('.user_row').hasClass('error')){
					$('.user_row').addClass('active');
					$('.user_row').addClass('error');
				}else{
					$('.user_row').removeClass('active')
					$('.user_row').removeClass('error');
				}
		});




		// Widget
		$('.support-widget').bind('click', function(){FreshWidget.show()})
			
		$("img").unveil();
		$("img").unveil(100, function() {
		  $(this).load(function() {
		    this.style.opacity = 1;
		  });
		});
		
		//freshchat header dynamic content	
		$('#target').teletype({
		  text: [
		    'random IPs into humans', 'eyeballs into engagement','visits into relationships','conversations into tickets'
		  ]
		});

		window['geoLocation'] = function () {
			if (typeof google !== 'undefined' && google.loader.ClientLocation){
				return currentLocation = google.loader.ClientLocation.address.country_code;
			}

			return 'US';
		};

        $('.banner-inner .video-play-btn').click( function(e){
        	 $('.banner-inner,.video-container,.home-customer-logos,.video-image,header').css('display','none');
        	  e.preventDefault();
        	 $('.origin-video,.animation-video,.close_btn').css('display','block');
            $('#origin-video').get(0).play();
        });

	   $("#origin-video").bind("ended", function(e) {
		   $('.origin-video,.animation-video,.close_btn').css('display','none');
		   e.preventDefault();
		   $('.banner-inner,.video-container,.home-customer-logos,.video-image,header').css('display','block');
		});

		try{
			$(".flipster").flipster({ style: 'carousel' });	
		}catch(e){

		}
		// $('.open-positon .roles.active .roles-status').html('Hiring now')
		$('.box-slider').boxRollSlider();
      
	});
}(window.jQuery);
/**
 * session.js 0.4.1
 * (c) 2012 Iain, CodeJoust
 * session.js is freely distributable under the MIT license.
 * Portions of session.js are inspired or borrowed from Underscore.js, and quirksmode.org demo javascript.
 * This version uses google's jsapi library for location services.
 * For details, see: https://github.com/codejoust/session.js
 */

var session_fetch = (function(win, doc, nav){
  // Changing the API Version invalidates olde cookies with previous api version tags.
  var API_VERSION = 0.4;
  // Settings: defaults
  var options = {
    // Use the HTML5 Geolocation API
    // this ONLY returns lat & long, no city/address
    use_html5_location: false,
    // Attempts to use IPInfoDB if provided a valid key
    // Get a key at http://ipinfodb.com/register.php
    ipinfodb_key: "5762384f7e95020da94cfd030d79770c3ec19e238d7cf1dc090f15f576b8c968",
    // Leaving true allows for fallback for both
    // the HTML5 location and the IPInfoDB
    gapi_location: false,
    // Name of the location cookie (set blank to disable cookie)
    //   - WARNING: different providers use the same cookie
    //   - if switching providers, remember to use another cookie or provide checks for old cookies
    location_cookie: "location",
    // Location cookie expiration in hours
    location_cookie_timeout: 5,
    // Session expiration in days
    session_timeout: 32,
    // Session cookie name (set blank to disable cookie)
    session_cookie: "first_session"
  };
  
  // Session object
  var SessionRunner = function(){
    // Helper for querying.
    // Usage: session.current_session.referrer_info.hostname.contains(['github.com','news.ycombinator.com'])
    String.prototype.contains = function(other_str){
      if (typeof(other_str) === 'string'){
        return (this.indexOf(other_str) !== -1); }
      for (var i = 0; i < other_str.length; i++){
        if (this.indexOf(other_str[i]) !== -1){ return true; } }
      return false; }
    // Merge options
    if (win.session && win.session.options) {
      for (option in win.session.options){
        options[option] = win.session.options[option]; }
    }
    // Modules to run
    // If the module has arguments,
    //   it _needs_ to return a callback function.
    var unloaded_modules = {
      api_version: API_VERSION,
      locale: modules.locale(),
      current_session: modules.session(),
      original_session: modules.session(
        options.session_cookie,
        options.session_timeout * 24 * 60 * 60 * 1000),
      browser: modules.browser(),
      plugins: modules.plugins(),
      time: modules.time(),
      device: modules.device()
    };
    // Location switch
    if (options.use_html5_location){
      unloaded_modules.location = modules.html5_location();
    } else if (options.ipinfodb_key){
      unloaded_modules.location = modules.ipinfodb_location(options.ipinfodb_key);
    } else if (options.gapi_location){
      unloaded_modules.location = modules.gapi_location();
    }
    // Cache win.session.start
    if (win.session && win.session.start){
      var start = win.session.start;
    }
    // Set up checking, if all modules are ready
    var asynchs = 0, module, result,
    check_asynch = function(deinc){
      if (deinc){ asynchs--; }
      if (asynchs === 0){
        // Run start calback
        if (start){ start(win.session); }
      }
    };
    win.session = {};
    // Run asynchronous methods
    for (var name in unloaded_modules){
      module = unloaded_modules[name];
      if (typeof module === "function"){
        try {
          module(function(data){
            win.session[name] = data;
            check_asynch(true);
          });
          asynchs++;
        } catch(err){
          if (win.console && typeof(console.log) === "function"){
            console.log(err); check_asynch(true); }
        }
      } else {
        win.session[name] = module;
      } }
    check_asynch();
  };
  
  
  // Browser (and OS) detection
  var browser = {
    detect: function(){
      return {
        browser: this.search(this.data.browser),
        version: this.search(nav.userAgent) || this.search(nav.appVersion),
        os: this.search(this.data.os)
    } },
    search: function(data) {
      if (typeof data === "object"){
        // search for string match
        for(var i = 0; i < data.length; i++) {
          var dataString = data[i].string,
              dataProp   = data[i].prop;
          this.version_string = data[i].versionSearch || data[i].identity;
          if (dataString){
            if (dataString.indexOf(data[i].subString) != -1){
              return data[i].identity;
            }
          } else if (dataProp){
            return data[i].identity;
          }
        }
      } else {
        // search for version number
        var index = data.indexOf(this.version_string);
        if (index == -1) return;
        return parseFloat(data.substr(index + this.version_string.length + 1));
      }
    },
    data: {
      browser: [
        { string: nav.userAgent, subString: "Chrome", identity: "Chrome" },
        { string: nav.userAgent, subString: "OmniWeb", versionSearch: "OmniWeb/", identity: "OmniWeb" },
        { string: nav.vendor, subString: "Apple", identity: "Safari", versionSearch: "Version" },
        { prop:   win.opera, identity: "Opera", versionSearch: "Version" },
        { string: nav.vendor, subString: "iCab",identity: "iCab" },
        { string: nav.vendor, subString: "KDE", identity: "Konqueror" },
        { string: nav.userAgent, subString: "Firefox", identity: "Firefox" },
        { string: nav.vendor, subString: "Camino", identity: "Camino" },
        { string: nav.userAgent, subString: "Netscape", identity: "Netscape" },
        { string: nav.userAgent, subString: "MSIE", identity: "Explorer", versionSearch: "MSIE" },
        { string: nav.userAgent, subString: "Gecko", identity: "Mozilla", versionSearch: "rv" },
        { string: nav.userAgent, subString: "Mozilla", identity: "Netscape", versionSearch: "Mozilla" }
      ],
      os: [
        { string: nav.platform, subString: "Win", identity: "Windows" },
        { string: nav.platform, subString: "Mac", identity: "Mac" },
        { string: nav.userAgent, subString: "iPhone", identity: "iPhone/iPod" },
        { string: nav.userAgent, subString: "iPad", identitiy: "iPad" },
        { string: nav.platform, subString: "Linux", identity: "Linux" },
        { string: nav.userAgent, subString: "Android", identity: "Android" }
      ]}
  };
  
  var modules = {
    browser: function(){
      return browser.detect();
    },
    time: function(){
      // split date and grab timezone estimation.
      // timezone estimation: http://www.onlineaspect.com/2007/06/08/auto-detect-a-time-zone-with-javascript/
      var d1 = new Date(), d2 = new Date();
      d1.setMonth(0); d1.setDate(1); d2.setMonth(6); d2.setDate(1);
      return({tz_offset: -(new Date().getTimezoneOffset()) / 60, observes_dst: (d1.getTimezoneOffset() !== d2.getTimezoneOffset()) });
      // Gives a browser estimation, not guaranteed to be correct.
    },
    locale: function() {
      var lang = ((
        nav.language        ||
        nav.browserLanguage ||
        nav.systemLanguage  ||
        nav.userLanguage
      ) || '').split("-");
      if (lang.length == 2){
        return {  lang: lang[0].toLowerCase() };
      } else if (lang) {
        return {lang: lang[0].toLowerCase() };
      } else { return{lang: null }; }
    },
    device: function() {
      var device = {
        screen: {
          width:  win.screen.width,
          height: win.screen.height
        }
      };
      device.viewport = {
        width:  win.innerWidth || doc.body.clientWidth || doc.documentElement.clientWidth,
        height: win.innerHeight || doc.body.clientHeight || doc.documentElement.clientHeight
      };
      device.is_tablet = !!nav.userAgent.match(/(iPad|SCH-I800|xoom|kindle)/i);
      device.is_phone = !device.is_tablet && !!nav.userAgent.match(/(iPhone|iPod|blackberry|android 0.5|htc|lg|midp|mmp|mobile|nokia|opera mini|palm|pocket|psp|sgh|smartphone|symbian|treo mini|Playstation Portable|SonyEricsson|Samsung|MobileExplorer|PalmSource|Benq|Windows Phone|Windows Mobile|IEMobile|Windows CE|Nintendo Wii)/i);
      device.is_mobile = device.is_tablet || device.is_phone;
      return device;
    },
    plugins: function(){
      var check_plugin = function(name){
        if (nav.plugins){
          var plugin, i = 0, length = nav.plugins.length;
          for (; i < length; i++ ){
            plugin = nav.plugins[i];
            if (plugin && plugin.name && plugin.name.toLowerCase().indexOf(name) !== -1){
              return true;
            } }
          return false;
        } return false;
      }
      return {
        flash:       check_plugin("flash"),
        silverlight: check_plugin("silverlight"),
        java:        check_plugin("java"),
        quicktime:   check_plugin("quicktime")
      }; 
    },
    session: function (cookie, expires){
      var session = util.get_obj(cookie);
      if (session == null){
        session = {
          visits: 1,
          start: new Date().getTime(), last_visit: new Date().getTime(),
          url: win.location.href, path: win.location.pathname,
          referrer: doc.referrer, referrer_info: util.parse_url(doc.referrer),
          search: { engine: null, query: null }
        };
        var search_engines = [
          { name: "Google", host: "google", query: "q" },
          { name: "Bing", host: "bing.com", query: "q" },
          { name: "Yahoo", host: "search.yahoo", query: "p" },
          { name: "AOL", host: "search.aol", query: "q" },
          { name: "Ask", host: "ask.com", query: "q" },
          { name: "Baidu", host: "baidu.com", query: "wd" }
        ], length = search_engines.length,
           engine, match, i = 0,
           fallbacks = 'q query term p wd query text'.split(' ');
        for (i = 0; i < length; i++){
          engine = search_engines[i];
          if (session.referrer_info.host.indexOf(engine.host) !== -1){
            session.search.engine = engine.name;
            session.search.query  = session.referrer_info.query[engine.query];
            session.search.terms  = session.search.query ? session.search.query.split(" ") : null;
            break;
          }
        }
        if (session.search.engine === null && session.referrer_info.search.length > 1){
          for (i = 0; i < fallbacks.length; i++){
            var terms = session.referrer_info.query[fallbacks[i]];
            if (terms){
              session.search.engine = "Unknown";
              session.search.query  = terms; session.search.terms  = terms.split(" ");
              break;
            }
          } 
        }
      } else {
        session.last_visit = new Date().getTime();
        session.visits++;
      }
      util.set_cookie(cookie, util.package_obj(session), expires);
      return session;
    },
    html5_location: function(){
      return function(callback){
        nav.geolocation.getCurrentPosition(function(pos){
          pos.source = 'html5';
          callback(pos);
        }, function(err) {
          if (options.gapi_location){
            modules.gapi_location()(callback);
          } else {
            callback({error: true, source: 'html5'}); }
        });
      };
    },
    gapi_location: function(){
      return function(callback){
        var location = util.get_obj(options.location_cookie);
        if (!location || location.source !== 'google'){
          win.gloader_ready = function() {
            if ("google" in win){
              if (win.google.loader.ClientLocation){
                win.google.loader.ClientLocation.source = "google";
                callback(win.google.loader.ClientLocation);
              } else {
                callback({error: true, source: "google"});
              }
              util.set_cookie(
                options.location_cookie,
                util.package_obj(win.google.loader.ClientLocation),
                options.location_cookie_timeout * 60 * 60 * 1000);
            }}
          util.embed_script("https://www.google.com/jsapi?callback=gloader_ready");
        } else {
          callback(location);
        }}
    },
    ipinfodb_location: function(api_key){
      return function (callback){
        var location_cookie = util.get_obj(options.location_cookie);
        if (location_cookie && location_cookie.source === 'ipinfodb'){ callback(location_cookie); }
        win.ipinfocb = function(data){
          if (data.statusCode === "OK"){
            data.source = "ipinfodb";
            util.set_cookie(
              options.location_cookie,
              util.package_obj(data),
              options.location_cookie * 60 * 60 * 1000);
            callback(data);
          } else {
            if (options.gapi_location){ return modules.gapi_location()(callback); }
            else { callback({error: true, source: "ipinfodb", message: data.statusMessage}); }
          }}
        util.embed_script("http://api.ipinfodb.com/v3/ip-city/?key=" + api_key + "&format=json&callback=ipinfocb");
      }}
  };
  
  // Utilities
  var util = {
    parse_url: function(url_str){
      var a = doc.createElement("a"), query = {};
      a.href = url_str; query_str = a.search.substr(1);
      // Disassemble query string
      if (query_str != ''){
        var pairs = query_str.split("&"), i = 0,
            length = pairs.length, parts;
        for (; i < length; i++){
          parts = pairs[i].split("=");
          if (parts.length === 2){
            query[parts[0]] = decodeURI(parts[1]); }
        }
      }
      return {
        host:     a.host,
        path:     a.pathname,
        protocol: a.protocol,
        port:     a.port === '' ? 80 : a.port,
        search:   a.search,
        query:    query }
    },
    set_cookie: function(cname, value, expires, options){ // from jquery.cookie.js
      if (!cname){ return null; }
      if (!options){ var options = {}; }
      if (value === null || value === undefined){ expires = -1; }
      if (expires){ options.expires = (new Date().getTime()) + expires; }
      return (doc.cookie = [
          encodeURIComponent(cname), '=',
          encodeURIComponent(String(value)),
          options.expires ? '; expires=' + new Date(options.expires).toUTCString() : '', // use expires attribute, max-age is not supported by IE
          '; path=' + (options.path ? options.path : '/'),
          options.domain ? '; domain=' + options.domain : '',
          (win.location && win.location.protocol === 'https:') ? '; secure' : ''
      ].join(''));
    },
    get_cookie: function(cookie_name, result){ // from jquery.cookie.js
      return (result = new RegExp('(?:^|; )' + encodeURIComponent(cookie_name) + '=([^;]*)').exec(doc.cookie)) ? decodeURIComponent(result[1]) : null;
    },
    embed_script: function(url){
      var element  = doc.createElement("script");
      element.type = "text/javascript";
      element.src  = url;
      doc.getElementsByTagName("body")[0].appendChild(element);
    },
    package_obj: function (obj){
	 if(!obj)return;
      obj.version = API_VERSION;
      var ret = JSON.stringify(obj);
      delete obj.version; return ret;
    },
    get_obj: function(cookie_name){
      var obj;
      try { obj = JSON.parse(util.get_cookie(cookie_name)); } catch(e){};
      if (obj && obj.version == API_VERSION){
        delete obj.version; return obj;
      }
    }
  };
  
  // JSON
  var JSON = {
    parse: (win.JSON && win.JSON.parse) || function(data){
        if (typeof data !== "string" || !data){ return null; }
        return (new Function("return " + data))();
    },
    stringify: (win.JSON && win.JSON.stringify) || function(object){
      var type = typeof object;
      if (type !== "object" || object === null) {
        if (type === "string"){ return '"' + object + '"'; }
      } else {
        var k, v, json = [],
            isArray = (object && object.constructor === Array);
        for (k in object ) {
          v = object[k]; type = typeof v;
          if (type === "string")
            v = '"' + v + '"';
          else if (type === "object" && v !== null)
            v = this.stringify(v);
          json.push((isArray ? "" : '"' + k + '":') + v);
        }
        return (isArray ? "[" : "{") + json.join(",") + (isArray ? "]" : "}");
      } } };

  // Initialize SessionRunner
  SessionRunner();

});
// Switch for testing purposes.
if (typeof(window.exports) === 'undefined'){
  session_fetch(window, document, navigator);
} else {
  window.exports.session = session_fetch;
}
;
/*
Copyright 2012 Igor Vaynberg

Version: 3.4.5 Timestamp: Mon Nov  4 08:22:42 PST 2013

This software is licensed under the Apache License, Version 2.0 (the "Apache License") or the GNU
General Public License version 2 (the "GPL License"). You may choose either license to govern your
use of this software only upon the condition that you accept all of the terms of either the Apache
License or the GPL License.

You may obtain a copy of the Apache License and the GPL License at:

http://www.apache.org/licenses/LICENSE-2.0
http://www.gnu.org/licenses/gpl-2.0.html

Unless required by applicable law or agreed to in writing, software distributed under the Apache License
or the GPL Licesnse is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
either express or implied. See the Apache License and the GPL License for the specific language governing
permissions and limitations under the Apache License and the GPL License.
*/

!function(a){"undefined"==typeof a.fn.each2&&a.extend(a.fn,{each2:function(b){for(var c=a([0]),d=-1,e=this.length;++d<e&&(c.context=c[0]=this[d])&&b.call(c[0],d,c)!==!1;);return this}})}(jQuery),function(a,b){"use strict";function n(a){var b,c,d,e;if(!a||a.length<1)return a;for(b="",c=0,d=a.length;d>c;c++)e=a.charAt(c),b+=m[e]||e;return b}function o(a,b){for(var c=0,d=b.length;d>c;c+=1)if(q(a,b[c]))return c;return-1}function p(){var b=a(l);b.appendTo("body");var c={width:b.width()-b[0].clientWidth,height:b.height()-b[0].clientHeight};return b.remove(),c}function q(a,c){return a===c?!0:a===b||c===b?!1:null===a||null===c?!1:a.constructor===String?a+""==c+"":c.constructor===String?c+""==a+"":!1}function r(b,c){var d,e,f;if(null===b||b.length<1)return[];for(d=b.split(c),e=0,f=d.length;f>e;e+=1)d[e]=a.trim(d[e]);return d}function s(a){return a.outerWidth(!1)-a.width()}function t(c){var d="keyup-change-value";c.on("keydown",function(){a.data(c,d)===b&&a.data(c,d,c.val())}),c.on("keyup",function(){var e=a.data(c,d);e!==b&&c.val()!==e&&(a.removeData(c,d),c.trigger("keyup-change"))})}function u(c){c.on("mousemove",function(c){var d=i;(d===b||d.x!==c.pageX||d.y!==c.pageY)&&a(c.target).trigger("mousemove-filtered",c)})}function v(a,c,d){d=d||b;var e;return function(){var b=arguments;window.clearTimeout(e),e=window.setTimeout(function(){c.apply(d,b)},a)}}function w(a){var c,b=!1;return function(){return b===!1&&(c=a(),b=!0),c}}function x(a,b){var c=v(a,function(a){b.trigger("scroll-debounced",a)});b.on("scroll",function(a){o(a.target,b.get())>=0&&c(a)})}function y(a){a[0]!==document.activeElement&&window.setTimeout(function(){var d,b=a[0],c=a.val().length;a.focus(),a.is(":visible")&&b===document.activeElement&&(b.setSelectionRange?b.setSelectionRange(c,c):b.createTextRange&&(d=b.createTextRange(),d.collapse(!1),d.select()))},0)}function z(b){b=a(b)[0];var c=0,d=0;if("selectionStart"in b)c=b.selectionStart,d=b.selectionEnd-c;else if("selection"in document){b.focus();var e=document.selection.createRange();d=document.selection.createRange().text.length,e.moveStart("character",-b.value.length),c=e.text.length-d}return{offset:c,length:d}}function A(a){a.preventDefault(),a.stopPropagation()}function B(a){a.preventDefault(),a.stopImmediatePropagation()}function C(b){if(!h){var c=b[0].currentStyle||window.getComputedStyle(b[0],null);h=a(document.createElement("div")).css({position:"absolute",left:"-10000px",top:"-10000px",display:"none",fontSize:c.fontSize,fontFamily:c.fontFamily,fontStyle:c.fontStyle,fontWeight:c.fontWeight,letterSpacing:c.letterSpacing,textTransform:c.textTransform,whiteSpace:"nowrap"}),h.attr("class","select2-sizer"),a("body").append(h)}return h.text(b.val()),h.width()}function D(b,c,d){var e,g,f=[];e=b.attr("class"),e&&(e=""+e,a(e.split(" ")).each2(function(){0===this.indexOf("select2-")&&f.push(this)})),e=c.attr("class"),e&&(e=""+e,a(e.split(" ")).each2(function(){0!==this.indexOf("select2-")&&(g=d(this),g&&f.push(g))})),b.attr("class",f.join(" "))}function E(a,b,c,d){var e=n(a.toUpperCase()).indexOf(n(b.toUpperCase())),f=b.length;return 0>e?(c.push(d(a)),void 0):(c.push(d(a.substring(0,e))),c.push("<span class='select2-match'>"),c.push(d(a.substring(e,e+f))),c.push("</span>"),c.push(d(a.substring(e+f,a.length))),void 0)}function F(a){var b={"\\":"&#92;","&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","/":"&#47;"};return String(a).replace(/[&<>"'\/\\]/g,function(a){return b[a]})}function G(c){var d,e=null,f=c.quietMillis||100,g=c.url,h=this;return function(i){window.clearTimeout(d),d=window.setTimeout(function(){var d=c.data,f=g,j=c.transport||a.fn.select2.ajaxDefaults.transport,k={type:c.type||"GET",cache:c.cache||!1,jsonpCallback:c.jsonpCallback||b,dataType:c.dataType||"json"},l=a.extend({},a.fn.select2.ajaxDefaults.params,k);d=d?d.call(h,i.term,i.page,i.context):null,f="function"==typeof f?f.call(h,i.term,i.page,i.context):f,e&&e.abort(),c.params&&(a.isFunction(c.params)?a.extend(l,c.params.call(h)):a.extend(l,c.params)),a.extend(l,{url:f,dataType:c.dataType,data:d,success:function(a){var b=c.results(a,i.page);i.callback(b)}}),e=j.call(h,l)},f)}}function H(b){var d,e,c=b,f=function(a){return""+a.text};a.isArray(c)&&(e=c,c={results:e}),a.isFunction(c)===!1&&(e=c,c=function(){return e});var g=c();return g.text&&(f=g.text,a.isFunction(f)||(d=g.text,f=function(a){return a[d]})),function(b){var g,d=b.term,e={results:[]};return""===d?(b.callback(c()),void 0):(g=function(c,e){var h,i;if(c=c[0],c.children){h={};for(i in c)c.hasOwnProperty(i)&&(h[i]=c[i]);h.children=[],a(c.children).each2(function(a,b){g(b,h.children)}),(h.children.length||b.matcher(d,f(h),c))&&e.push(h)}else b.matcher(d,f(c),c)&&e.push(c)},a(c().results).each2(function(a,b){g(b,e.results)}),b.callback(e),void 0)}}function I(c){var d=a.isFunction(c);return function(e){var f=e.term,g={results:[]};a(d?c():c).each(function(){var a=this.text!==b,c=a?this.text:this;(""===f||e.matcher(f,c))&&g.results.push(a?this:{id:this,text:this})}),e.callback(g)}}function J(b,c){if(a.isFunction(b))return!0;if(!b)return!1;throw new Error(c+" must be a function or a falsy value")}function K(b){return a.isFunction(b)?b():b}function L(b){var c=0;return a.each(b,function(a,b){b.children?c+=L(b.children):c++}),c}function M(a,c,d,e){var h,i,j,k,l,f=a,g=!1;if(!e.createSearchChoice||!e.tokenSeparators||e.tokenSeparators.length<1)return b;for(;;){for(i=-1,j=0,k=e.tokenSeparators.length;k>j&&(l=e.tokenSeparators[j],i=a.indexOf(l),!(i>=0));j++);if(0>i)break;if(h=a.substring(0,i),a=a.substring(i+l.length),h.length>0&&(h=e.createSearchChoice.call(this,h,c),h!==b&&null!==h&&e.id(h)!==b&&null!==e.id(h))){for(g=!1,j=0,k=c.length;k>j;j++)if(q(e.id(h),e.id(c[j]))){g=!0;break}g||d(h)}}return f!==a?a:void 0}function N(b,c){var d=function(){};return d.prototype=new b,d.prototype.constructor=d,d.prototype.parent=b.prototype,d.prototype=a.extend(d.prototype,c),d}if(window.Select2===b){var c,d,e,f,g,h,j,k,i={x:0,y:0},c={TAB:9,ENTER:13,ESC:27,SPACE:32,LEFT:37,UP:38,RIGHT:39,DOWN:40,SHIFT:16,CTRL:17,ALT:18,PAGE_UP:33,PAGE_DOWN:34,HOME:36,END:35,BACKSPACE:8,DELETE:46,isArrow:function(a){switch(a=a.which?a.which:a){case c.LEFT:case c.RIGHT:case c.UP:case c.DOWN:return!0}return!1},isControl:function(a){var b=a.which;switch(b){case c.SHIFT:case c.CTRL:case c.ALT:return!0}return a.metaKey?!0:!1},isFunctionKey:function(a){return a=a.which?a.which:a,a>=112&&123>=a}},l="<div class='select2-measure-scrollbar'></div>",m={"\u24b6":"A","\uff21":"A","\xc0":"A","\xc1":"A","\xc2":"A","\u1ea6":"A","\u1ea4":"A","\u1eaa":"A","\u1ea8":"A","\xc3":"A","\u0100":"A","\u0102":"A","\u1eb0":"A","\u1eae":"A","\u1eb4":"A","\u1eb2":"A","\u0226":"A","\u01e0":"A","\xc4":"A","\u01de":"A","\u1ea2":"A","\xc5":"A","\u01fa":"A","\u01cd":"A","\u0200":"A","\u0202":"A","\u1ea0":"A","\u1eac":"A","\u1eb6":"A","\u1e00":"A","\u0104":"A","\u023a":"A","\u2c6f":"A","\ua732":"AA","\xc6":"AE","\u01fc":"AE","\u01e2":"AE","\ua734":"AO","\ua736":"AU","\ua738":"AV","\ua73a":"AV","\ua73c":"AY","\u24b7":"B","\uff22":"B","\u1e02":"B","\u1e04":"B","\u1e06":"B","\u0243":"B","\u0182":"B","\u0181":"B","\u24b8":"C","\uff23":"C","\u0106":"C","\u0108":"C","\u010a":"C","\u010c":"C","\xc7":"C","\u1e08":"C","\u0187":"C","\u023b":"C","\ua73e":"C","\u24b9":"D","\uff24":"D","\u1e0a":"D","\u010e":"D","\u1e0c":"D","\u1e10":"D","\u1e12":"D","\u1e0e":"D","\u0110":"D","\u018b":"D","\u018a":"D","\u0189":"D","\ua779":"D","\u01f1":"DZ","\u01c4":"DZ","\u01f2":"Dz","\u01c5":"Dz","\u24ba":"E","\uff25":"E","\xc8":"E","\xc9":"E","\xca":"E","\u1ec0":"E","\u1ebe":"E","\u1ec4":"E","\u1ec2":"E","\u1ebc":"E","\u0112":"E","\u1e14":"E","\u1e16":"E","\u0114":"E","\u0116":"E","\xcb":"E","\u1eba":"E","\u011a":"E","\u0204":"E","\u0206":"E","\u1eb8":"E","\u1ec6":"E","\u0228":"E","\u1e1c":"E","\u0118":"E","\u1e18":"E","\u1e1a":"E","\u0190":"E","\u018e":"E","\u24bb":"F","\uff26":"F","\u1e1e":"F","\u0191":"F","\ua77b":"F","\u24bc":"G","\uff27":"G","\u01f4":"G","\u011c":"G","\u1e20":"G","\u011e":"G","\u0120":"G","\u01e6":"G","\u0122":"G","\u01e4":"G","\u0193":"G","\ua7a0":"G","\ua77d":"G","\ua77e":"G","\u24bd":"H","\uff28":"H","\u0124":"H","\u1e22":"H","\u1e26":"H","\u021e":"H","\u1e24":"H","\u1e28":"H","\u1e2a":"H","\u0126":"H","\u2c67":"H","\u2c75":"H","\ua78d":"H","\u24be":"I","\uff29":"I","\xcc":"I","\xcd":"I","\xce":"I","\u0128":"I","\u012a":"I","\u012c":"I","\u0130":"I","\xcf":"I","\u1e2e":"I","\u1ec8":"I","\u01cf":"I","\u0208":"I","\u020a":"I","\u1eca":"I","\u012e":"I","\u1e2c":"I","\u0197":"I","\u24bf":"J","\uff2a":"J","\u0134":"J","\u0248":"J","\u24c0":"K","\uff2b":"K","\u1e30":"K","\u01e8":"K","\u1e32":"K","\u0136":"K","\u1e34":"K","\u0198":"K","\u2c69":"K","\ua740":"K","\ua742":"K","\ua744":"K","\ua7a2":"K","\u24c1":"L","\uff2c":"L","\u013f":"L","\u0139":"L","\u013d":"L","\u1e36":"L","\u1e38":"L","\u013b":"L","\u1e3c":"L","\u1e3a":"L","\u0141":"L","\u023d":"L","\u2c62":"L","\u2c60":"L","\ua748":"L","\ua746":"L","\ua780":"L","\u01c7":"LJ","\u01c8":"Lj","\u24c2":"M","\uff2d":"M","\u1e3e":"M","\u1e40":"M","\u1e42":"M","\u2c6e":"M","\u019c":"M","\u24c3":"N","\uff2e":"N","\u01f8":"N","\u0143":"N","\xd1":"N","\u1e44":"N","\u0147":"N","\u1e46":"N","\u0145":"N","\u1e4a":"N","\u1e48":"N","\u0220":"N","\u019d":"N","\ua790":"N","\ua7a4":"N","\u01ca":"NJ","\u01cb":"Nj","\u24c4":"O","\uff2f":"O","\xd2":"O","\xd3":"O","\xd4":"O","\u1ed2":"O","\u1ed0":"O","\u1ed6":"O","\u1ed4":"O","\xd5":"O","\u1e4c":"O","\u022c":"O","\u1e4e":"O","\u014c":"O","\u1e50":"O","\u1e52":"O","\u014e":"O","\u022e":"O","\u0230":"O","\xd6":"O","\u022a":"O","\u1ece":"O","\u0150":"O","\u01d1":"O","\u020c":"O","\u020e":"O","\u01a0":"O","\u1edc":"O","\u1eda":"O","\u1ee0":"O","\u1ede":"O","\u1ee2":"O","\u1ecc":"O","\u1ed8":"O","\u01ea":"O","\u01ec":"O","\xd8":"O","\u01fe":"O","\u0186":"O","\u019f":"O","\ua74a":"O","\ua74c":"O","\u01a2":"OI","\ua74e":"OO","\u0222":"OU","\u24c5":"P","\uff30":"P","\u1e54":"P","\u1e56":"P","\u01a4":"P","\u2c63":"P","\ua750":"P","\ua752":"P","\ua754":"P","\u24c6":"Q","\uff31":"Q","\ua756":"Q","\ua758":"Q","\u024a":"Q","\u24c7":"R","\uff32":"R","\u0154":"R","\u1e58":"R","\u0158":"R","\u0210":"R","\u0212":"R","\u1e5a":"R","\u1e5c":"R","\u0156":"R","\u1e5e":"R","\u024c":"R","\u2c64":"R","\ua75a":"R","\ua7a6":"R","\ua782":"R","\u24c8":"S","\uff33":"S","\u1e9e":"S","\u015a":"S","\u1e64":"S","\u015c":"S","\u1e60":"S","\u0160":"S","\u1e66":"S","\u1e62":"S","\u1e68":"S","\u0218":"S","\u015e":"S","\u2c7e":"S","\ua7a8":"S","\ua784":"S","\u24c9":"T","\uff34":"T","\u1e6a":"T","\u0164":"T","\u1e6c":"T","\u021a":"T","\u0162":"T","\u1e70":"T","\u1e6e":"T","\u0166":"T","\u01ac":"T","\u01ae":"T","\u023e":"T","\ua786":"T","\ua728":"TZ","\u24ca":"U","\uff35":"U","\xd9":"U","\xda":"U","\xdb":"U","\u0168":"U","\u1e78":"U","\u016a":"U","\u1e7a":"U","\u016c":"U","\xdc":"U","\u01db":"U","\u01d7":"U","\u01d5":"U","\u01d9":"U","\u1ee6":"U","\u016e":"U","\u0170":"U","\u01d3":"U","\u0214":"U","\u0216":"U","\u01af":"U","\u1eea":"U","\u1ee8":"U","\u1eee":"U","\u1eec":"U","\u1ef0":"U","\u1ee4":"U","\u1e72":"U","\u0172":"U","\u1e76":"U","\u1e74":"U","\u0244":"U","\u24cb":"V","\uff36":"V","\u1e7c":"V","\u1e7e":"V","\u01b2":"V","\ua75e":"V","\u0245":"V","\ua760":"VY","\u24cc":"W","\uff37":"W","\u1e80":"W","\u1e82":"W","\u0174":"W","\u1e86":"W","\u1e84":"W","\u1e88":"W","\u2c72":"W","\u24cd":"X","\uff38":"X","\u1e8a":"X","\u1e8c":"X","\u24ce":"Y","\uff39":"Y","\u1ef2":"Y","\xdd":"Y","\u0176":"Y","\u1ef8":"Y","\u0232":"Y","\u1e8e":"Y","\u0178":"Y","\u1ef6":"Y","\u1ef4":"Y","\u01b3":"Y","\u024e":"Y","\u1efe":"Y","\u24cf":"Z","\uff3a":"Z","\u0179":"Z","\u1e90":"Z","\u017b":"Z","\u017d":"Z","\u1e92":"Z","\u1e94":"Z","\u01b5":"Z","\u0224":"Z","\u2c7f":"Z","\u2c6b":"Z","\ua762":"Z","\u24d0":"a","\uff41":"a","\u1e9a":"a","\xe0":"a","\xe1":"a","\xe2":"a","\u1ea7":"a","\u1ea5":"a","\u1eab":"a","\u1ea9":"a","\xe3":"a","\u0101":"a","\u0103":"a","\u1eb1":"a","\u1eaf":"a","\u1eb5":"a","\u1eb3":"a","\u0227":"a","\u01e1":"a","\xe4":"a","\u01df":"a","\u1ea3":"a","\xe5":"a","\u01fb":"a","\u01ce":"a","\u0201":"a","\u0203":"a","\u1ea1":"a","\u1ead":"a","\u1eb7":"a","\u1e01":"a","\u0105":"a","\u2c65":"a","\u0250":"a","\ua733":"aa","\xe6":"ae","\u01fd":"ae","\u01e3":"ae","\ua735":"ao","\ua737":"au","\ua739":"av","\ua73b":"av","\ua73d":"ay","\u24d1":"b","\uff42":"b","\u1e03":"b","\u1e05":"b","\u1e07":"b","\u0180":"b","\u0183":"b","\u0253":"b","\u24d2":"c","\uff43":"c","\u0107":"c","\u0109":"c","\u010b":"c","\u010d":"c","\xe7":"c","\u1e09":"c","\u0188":"c","\u023c":"c","\ua73f":"c","\u2184":"c","\u24d3":"d","\uff44":"d","\u1e0b":"d","\u010f":"d","\u1e0d":"d","\u1e11":"d","\u1e13":"d","\u1e0f":"d","\u0111":"d","\u018c":"d","\u0256":"d","\u0257":"d","\ua77a":"d","\u01f3":"dz","\u01c6":"dz","\u24d4":"e","\uff45":"e","\xe8":"e","\xe9":"e","\xea":"e","\u1ec1":"e","\u1ebf":"e","\u1ec5":"e","\u1ec3":"e","\u1ebd":"e","\u0113":"e","\u1e15":"e","\u1e17":"e","\u0115":"e","\u0117":"e","\xeb":"e","\u1ebb":"e","\u011b":"e","\u0205":"e","\u0207":"e","\u1eb9":"e","\u1ec7":"e","\u0229":"e","\u1e1d":"e","\u0119":"e","\u1e19":"e","\u1e1b":"e","\u0247":"e","\u025b":"e","\u01dd":"e","\u24d5":"f","\uff46":"f","\u1e1f":"f","\u0192":"f","\ua77c":"f","\u24d6":"g","\uff47":"g","\u01f5":"g","\u011d":"g","\u1e21":"g","\u011f":"g","\u0121":"g","\u01e7":"g","\u0123":"g","\u01e5":"g","\u0260":"g","\ua7a1":"g","\u1d79":"g","\ua77f":"g","\u24d7":"h","\uff48":"h","\u0125":"h","\u1e23":"h","\u1e27":"h","\u021f":"h","\u1e25":"h","\u1e29":"h","\u1e2b":"h","\u1e96":"h","\u0127":"h","\u2c68":"h","\u2c76":"h","\u0265":"h","\u0195":"hv","\u24d8":"i","\uff49":"i","\xec":"i","\xed":"i","\xee":"i","\u0129":"i","\u012b":"i","\u012d":"i","\xef":"i","\u1e2f":"i","\u1ec9":"i","\u01d0":"i","\u0209":"i","\u020b":"i","\u1ecb":"i","\u012f":"i","\u1e2d":"i","\u0268":"i","\u0131":"i","\u24d9":"j","\uff4a":"j","\u0135":"j","\u01f0":"j","\u0249":"j","\u24da":"k","\uff4b":"k","\u1e31":"k","\u01e9":"k","\u1e33":"k","\u0137":"k","\u1e35":"k","\u0199":"k","\u2c6a":"k","\ua741":"k","\ua743":"k","\ua745":"k","\ua7a3":"k","\u24db":"l","\uff4c":"l","\u0140":"l","\u013a":"l","\u013e":"l","\u1e37":"l","\u1e39":"l","\u013c":"l","\u1e3d":"l","\u1e3b":"l","\u017f":"l","\u0142":"l","\u019a":"l","\u026b":"l","\u2c61":"l","\ua749":"l","\ua781":"l","\ua747":"l","\u01c9":"lj","\u24dc":"m","\uff4d":"m","\u1e3f":"m","\u1e41":"m","\u1e43":"m","\u0271":"m","\u026f":"m","\u24dd":"n","\uff4e":"n","\u01f9":"n","\u0144":"n","\xf1":"n","\u1e45":"n","\u0148":"n","\u1e47":"n","\u0146":"n","\u1e4b":"n","\u1e49":"n","\u019e":"n","\u0272":"n","\u0149":"n","\ua791":"n","\ua7a5":"n","\u01cc":"nj","\u24de":"o","\uff4f":"o","\xf2":"o","\xf3":"o","\xf4":"o","\u1ed3":"o","\u1ed1":"o","\u1ed7":"o","\u1ed5":"o","\xf5":"o","\u1e4d":"o","\u022d":"o","\u1e4f":"o","\u014d":"o","\u1e51":"o","\u1e53":"o","\u014f":"o","\u022f":"o","\u0231":"o","\xf6":"o","\u022b":"o","\u1ecf":"o","\u0151":"o","\u01d2":"o","\u020d":"o","\u020f":"o","\u01a1":"o","\u1edd":"o","\u1edb":"o","\u1ee1":"o","\u1edf":"o","\u1ee3":"o","\u1ecd":"o","\u1ed9":"o","\u01eb":"o","\u01ed":"o","\xf8":"o","\u01ff":"o","\u0254":"o","\ua74b":"o","\ua74d":"o","\u0275":"o","\u01a3":"oi","\u0223":"ou","\ua74f":"oo","\u24df":"p","\uff50":"p","\u1e55":"p","\u1e57":"p","\u01a5":"p","\u1d7d":"p","\ua751":"p","\ua753":"p","\ua755":"p","\u24e0":"q","\uff51":"q","\u024b":"q","\ua757":"q","\ua759":"q","\u24e1":"r","\uff52":"r","\u0155":"r","\u1e59":"r","\u0159":"r","\u0211":"r","\u0213":"r","\u1e5b":"r","\u1e5d":"r","\u0157":"r","\u1e5f":"r","\u024d":"r","\u027d":"r","\ua75b":"r","\ua7a7":"r","\ua783":"r","\u24e2":"s","\uff53":"s","\xdf":"s","\u015b":"s","\u1e65":"s","\u015d":"s","\u1e61":"s","\u0161":"s","\u1e67":"s","\u1e63":"s","\u1e69":"s","\u0219":"s","\u015f":"s","\u023f":"s","\ua7a9":"s","\ua785":"s","\u1e9b":"s","\u24e3":"t","\uff54":"t","\u1e6b":"t","\u1e97":"t","\u0165":"t","\u1e6d":"t","\u021b":"t","\u0163":"t","\u1e71":"t","\u1e6f":"t","\u0167":"t","\u01ad":"t","\u0288":"t","\u2c66":"t","\ua787":"t","\ua729":"tz","\u24e4":"u","\uff55":"u","\xf9":"u","\xfa":"u","\xfb":"u","\u0169":"u","\u1e79":"u","\u016b":"u","\u1e7b":"u","\u016d":"u","\xfc":"u","\u01dc":"u","\u01d8":"u","\u01d6":"u","\u01da":"u","\u1ee7":"u","\u016f":"u","\u0171":"u","\u01d4":"u","\u0215":"u","\u0217":"u","\u01b0":"u","\u1eeb":"u","\u1ee9":"u","\u1eef":"u","\u1eed":"u","\u1ef1":"u","\u1ee5":"u","\u1e73":"u","\u0173":"u","\u1e77":"u","\u1e75":"u","\u0289":"u","\u24e5":"v","\uff56":"v","\u1e7d":"v","\u1e7f":"v","\u028b":"v","\ua75f":"v","\u028c":"v","\ua761":"vy","\u24e6":"w","\uff57":"w","\u1e81":"w","\u1e83":"w","\u0175":"w","\u1e87":"w","\u1e85":"w","\u1e98":"w","\u1e89":"w","\u2c73":"w","\u24e7":"x","\uff58":"x","\u1e8b":"x","\u1e8d":"x","\u24e8":"y","\uff59":"y","\u1ef3":"y","\xfd":"y","\u0177":"y","\u1ef9":"y","\u0233":"y","\u1e8f":"y","\xff":"y","\u1ef7":"y","\u1e99":"y","\u1ef5":"y","\u01b4":"y","\u024f":"y","\u1eff":"y","\u24e9":"z","\uff5a":"z","\u017a":"z","\u1e91":"z","\u017c":"z","\u017e":"z","\u1e93":"z","\u1e95":"z","\u01b6":"z","\u0225":"z","\u0240":"z","\u2c6c":"z","\ua763":"z"};j=a(document),g=function(){var a=1;return function(){return a++}}(),j.on("mousemove",function(a){i.x=a.pageX,i.y=a.pageY}),d=N(Object,{bind:function(a){var b=this;return function(){a.apply(b,arguments)}},init:function(c){var d,e,f=".select2-results";this.opts=c=this.prepareOpts(c),this.id=c.id,c.element.data("select2")!==b&&null!==c.element.data("select2")&&c.element.data("select2").destroy(),this.container=this.createContainer(),this.containerId="s2id_"+(c.element.attr("id")||"autogen"+g()),this.containerSelector="#"+this.containerId.replace(/([;&,\.\+\*\~':"\!\^#$%@\[\]\(\)=>\|])/g,"\\$1"),this.container.attr("id",this.containerId),this.body=w(function(){return c.element.closest("body")}),D(this.container,this.opts.element,this.opts.adaptContainerCssClass),this.container.attr("style",c.element.attr("style")),this.container.css(K(c.containerCss)),this.container.addClass(K(c.containerCssClass)),this.elementTabIndex=this.opts.element.attr("tabindex"),this.opts.element.data("select2",this).attr("tabindex","-1").before(this.container).on("click.select2",A),this.container.data("select2",this),this.dropdown=this.container.find(".select2-drop"),D(this.dropdown,this.opts.element,this.opts.adaptDropdownCssClass),this.dropdown.addClass(K(c.dropdownCssClass)),this.dropdown.data("select2",this),this.dropdown.on("click",A),this.results=d=this.container.find(f),this.search=e=this.container.find("input.select2-input"),this.queryCount=0,this.resultsPage=0,this.context=null,this.initContainer(),this.container.on("click",A),u(this.results),this.dropdown.on("mousemove-filtered touchstart touchmove touchend",f,this.bind(this.highlightUnderEvent)),x(80,this.results),this.dropdown.on("scroll-debounced",f,this.bind(this.loadMoreIfNeeded)),a(this.container).on("change",".select2-input",function(a){a.stopPropagation()}),a(this.dropdown).on("change",".select2-input",function(a){a.stopPropagation()}),a.fn.mousewheel&&d.mousewheel(function(a,b,c,e){var f=d.scrollTop();e>0&&0>=f-e?(d.scrollTop(0),A(a)):0>e&&d.get(0).scrollHeight-d.scrollTop()+e<=d.height()&&(d.scrollTop(d.get(0).scrollHeight-d.height()),A(a))}),t(e),e.on("keyup-change input paste",this.bind(this.updateResults)),e.on("focus",function(){e.addClass("select2-focused")}),e.on("blur",function(){e.removeClass("select2-focused")}),this.dropdown.on("mouseup",f,this.bind(function(b){a(b.target).closest(".select2-result-selectable").length>0&&(this.highlightUnderEvent(b),this.selectHighlighted(b))})),this.dropdown.on("click mouseup mousedown",function(a){a.stopPropagation()}),a.isFunction(this.opts.initSelection)&&(this.initSelection(),this.monitorSource()),null!==c.maximumInputLength&&this.search.attr("maxlength",c.maximumInputLength);var h=c.element.prop("disabled");h===b&&(h=!1),this.enable(!h);var i=c.element.prop("readonly");i===b&&(i=!1),this.readonly(i),k=k||p(),this.autofocus=c.element.prop("autofocus"),c.element.prop("autofocus",!1),this.autofocus&&this.focus(),this.nextSearchTerm=b},destroy:function(){var a=this.opts.element,c=a.data("select2");this.close(),this.propertyObserver&&(delete this.propertyObserver,this.propertyObserver=null),c!==b&&(c.container.remove(),c.dropdown.remove(),a.removeClass("select2-offscreen").removeData("select2").off(".select2").prop("autofocus",this.autofocus||!1),this.elementTabIndex?a.attr({tabindex:this.elementTabIndex}):a.removeAttr("tabindex"),a.show())},optionToData:function(a){return a.is("option")?{id:a.prop("value"),text:a.text(),element:a.get(),css:a.attr("class"),disabled:a.prop("disabled"),locked:q(a.attr("locked"),"locked")||q(a.data("locked"),!0)}:a.is("optgroup")?{text:a.attr("label"),children:[],element:a.get(),css:a.attr("class")}:void 0},prepareOpts:function(c){var d,e,f,g,h=this;if(d=c.element,"select"===d.get(0).tagName.toLowerCase()&&(this.select=e=c.element),e&&a.each(["id","multiple","ajax","query","createSearchChoice","initSelection","data","tags"],function(){if(this in c)throw new Error("Option '"+this+"' is not allowed for Select2 when attached to a <select> element.")}),c=a.extend({},{populateResults:function(d,e,f){var g,i=this.opts.id;g=function(d,e,j){var k,l,m,n,o,p,q,r,s,t;for(d=c.sortResults(d,e,f),k=0,l=d.length;l>k;k+=1)m=d[k],o=m.disabled===!0,n=!o&&i(m)!==b,p=m.children&&m.children.length>0,q=a("<li></li>"),q.addClass("select2-results-dept-"+j),q.addClass("select2-result"),q.addClass(n?"select2-result-selectable":"select2-result-unselectable"),o&&q.addClass("select2-disabled"),p&&q.addClass("select2-result-with-children"),q.addClass(h.opts.formatResultCssClass(m)),r=a(document.createElement("div")),r.addClass("select2-result-label"),t=c.formatResult(m,r,f,h.opts.escapeMarkup),t!==b&&r.html(t),q.append(r),p&&(s=a("<ul></ul>"),s.addClass("select2-result-sub"),g(m.children,s,j+1),q.append(s)),q.data("select2-data",m),e.append(q)},g(e,d,0)}},a.fn.select2.defaults,c),"function"!=typeof c.id&&(f=c.id,c.id=function(a){return a[f]}),a.isArray(c.element.data("select2Tags"))){if("tags"in c)throw"tags specified as both an attribute 'data-select2-tags' and in options of Select2 "+c.element.attr("id");c.tags=c.element.data("select2Tags")}if(e?(c.query=this.bind(function(a){var f,g,i,c={results:[],more:!1},e=a.term;i=function(b,c){var d;b.is("option")?a.matcher(e,b.text(),b)&&c.push(h.optionToData(b)):b.is("optgroup")&&(d=h.optionToData(b),b.children().each2(function(a,b){i(b,d.children)}),d.children.length>0&&c.push(d))},f=d.children(),this.getPlaceholder()!==b&&f.length>0&&(g=this.getPlaceholderOption(),g&&(f=f.not(g))),f.each2(function(a,b){i(b,c.results)}),a.callback(c)}),c.id=function(a){return a.id},c.formatResultCssClass=function(a){return a.css}):"query"in c||("ajax"in c?(g=c.element.data("ajax-url"),g&&g.length>0&&(c.ajax.url=g),c.query=G.call(c.element,c.ajax)):"data"in c?c.query=H(c.data):"tags"in c&&(c.query=I(c.tags),c.createSearchChoice===b&&(c.createSearchChoice=function(b){return{id:a.trim(b),text:a.trim(b)}}),c.initSelection===b&&(c.initSelection=function(b,d){var e=[];a(r(b.val(),c.separator)).each(function(){var b={id:this,text:this},d=c.tags;a.isFunction(d)&&(d=d()),a(d).each(function(){return q(this.id,b.id)?(b=this,!1):void 0}),e.push(b)}),d(e)}))),"function"!=typeof c.query)throw"query function not defined for Select2 "+c.element.attr("id");return c},monitorSource:function(){var c,d,a=this.opts.element;a.on("change.select2",this.bind(function(){this.opts.element.data("select2-change-triggered")!==!0&&this.initSelection()})),c=this.bind(function(){var c=a.prop("disabled");c===b&&(c=!1),this.enable(!c);var d=a.prop("readonly");d===b&&(d=!1),this.readonly(d),D(this.container,this.opts.element,this.opts.adaptContainerCssClass),this.container.addClass(K(this.opts.containerCssClass)),D(this.dropdown,this.opts.element,this.opts.adaptDropdownCssClass),this.dropdown.addClass(K(this.opts.dropdownCssClass))}),a.on("propertychange.select2",c),this.mutationCallback===b&&(this.mutationCallback=function(a){a.forEach(c)}),d=window.MutationObserver||window.WebKitMutationObserver||window.MozMutationObserver,d!==b&&(this.propertyObserver&&(delete this.propertyObserver,this.propertyObserver=null),this.propertyObserver=new d(this.mutationCallback),this.propertyObserver.observe(a.get(0),{attributes:!0,subtree:!1}))},triggerSelect:function(b){var c=a.Event("select2-selecting",{val:this.id(b),object:b});return this.opts.element.trigger(c),!c.isDefaultPrevented()},triggerChange:function(b){b=b||{},b=a.extend({},b,{type:"change",val:this.val()}),this.opts.element.data("select2-change-triggered",!0),this.opts.element.trigger(b),this.opts.element.data("select2-change-triggered",!1),this.opts.element.click(),this.opts.blurOnChange&&this.opts.element.blur()},isInterfaceEnabled:function(){return this.enabledInterface===!0},enableInterface:function(){var a=this._enabled&&!this._readonly,b=!a;return a===this.enabledInterface?!1:(this.container.toggleClass("select2-container-disabled",b),this.close(),this.enabledInterface=a,!0)},enable:function(a){a===b&&(a=!0),this._enabled!==a&&(this._enabled=a,this.opts.element.prop("disabled",!a),this.enableInterface())},disable:function(){this.enable(!1)},readonly:function(a){return a===b&&(a=!1),this._readonly===a?!1:(this._readonly=a,this.opts.element.prop("readonly",a),this.enableInterface(),!0)},opened:function(){return this.container.hasClass("select2-dropdown-open")},positionDropdown:function(){var t,u,v,w,x,b=this.dropdown,c=this.container.offset(),d=this.container.outerHeight(!1),e=this.container.outerWidth(!1),f=b.outerHeight(!1),g=a(window),h=g.width(),i=g.height(),j=g.scrollLeft()+h,l=g.scrollTop()+i,m=c.top+d,n=c.left,o=l>=m+f,p=c.top-f>=this.body().scrollTop(),q=b.outerWidth(!1),r=j>=n+q,s=b.hasClass("select2-drop-above");s?(u=!0,!p&&o&&(v=!0,u=!1)):(u=!1,!o&&p&&(v=!0,u=!0)),v&&(b.hide(),c=this.container.offset(),d=this.container.outerHeight(!1),e=this.container.outerWidth(!1),f=b.outerHeight(!1),j=g.scrollLeft()+h,l=g.scrollTop()+i,m=c.top+d,n=c.left,q=b.outerWidth(!1),r=j>=n+q,b.show()),this.opts.dropdownAutoWidth?(x=a(".select2-results",b)[0],b.addClass("select2-drop-auto-width"),b.css("width",""),q=b.outerWidth(!1)+(x.scrollHeight===x.clientHeight?0:k.width),q>e?e=q:q=e,r=j>=n+q):this.container.removeClass("select2-drop-auto-width"),"static"!==this.body().css("position")&&(t=this.body().offset(),m-=t.top,n-=t.left),r||(n=c.left+e-q),w={left:n,width:e},u?(w.bottom=i-c.top,w.top="auto",this.container.addClass("select2-drop-above"),b.addClass("select2-drop-above")):(w.top=m,w.bottom="auto",this.container.removeClass("select2-drop-above"),b.removeClass("select2-drop-above")),w=a.extend(w,K(this.opts.dropdownCss)),b.css(w)},shouldOpen:function(){var b;return this.opened()?!1:this._enabled===!1||this._readonly===!0?!1:(b=a.Event("select2-opening"),this.opts.element.trigger(b),!b.isDefaultPrevented())},clearDropdownAlignmentPreference:function(){this.container.removeClass("select2-drop-above"),this.dropdown.removeClass("select2-drop-above")},open:function(){return this.shouldOpen()?(this.opening(),!0):!1},opening:function(){var f,b=this.containerId,c="scroll."+b,d="resize."+b,e="orientationchange."+b;this.container.addClass("select2-dropdown-open").addClass("select2-container-active"),this.clearDropdownAlignmentPreference(),this.dropdown[0]!==this.body().children().last()[0]&&this.dropdown.detach().appendTo(this.body()),f=a("#select2-drop-mask"),0==f.length&&(f=a(document.createElement("div")),f.attr("id","select2-drop-mask").attr("class","select2-drop-mask"),f.hide(),f.appendTo(this.body()),f.on("mousedown touchstart click",function(b){var d,c=a("#select2-drop");c.length>0&&(d=c.data("select2"),d.opts.selectOnBlur&&d.selectHighlighted({noFocus:!0}),d.close({focus:!0}),b.preventDefault(),b.stopPropagation())})),this.dropdown.prev()[0]!==f[0]&&this.dropdown.before(f),a("#select2-drop").removeAttr("id"),this.dropdown.attr("id","select2-drop"),f.show(),this.positionDropdown(),this.dropdown.show(),this.positionDropdown(),this.dropdown.addClass("select2-drop-active");var g=this;this.container.parents().add(window).each(function(){a(this).on(d+" "+c+" "+e,function(){g.positionDropdown()})})},close:function(){if(this.opened()){var b=this.containerId,c="scroll."+b,d="resize."+b,e="orientationchange."+b;this.container.parents().add(window).each(function(){a(this).off(c).off(d).off(e)}),this.clearDropdownAlignmentPreference(),a("#select2-drop-mask").hide(),this.dropdown.removeAttr("id"),this.dropdown.hide(),this.container.removeClass("select2-dropdown-open").removeClass("select2-container-active"),this.results.empty(),this.clearSearch(),this.search.removeClass("select2-active"),this.opts.element.trigger(a.Event("select2-close"))}},externalSearch:function(a){this.open(),this.search.val(a),this.updateResults(!1)},clearSearch:function(){},getMaximumSelectionSize:function(){return K(this.opts.maximumSelectionSize)},ensureHighlightVisible:function(){var c,d,e,f,g,h,i,b=this.results;if(d=this.highlight(),!(0>d)){if(0==d)return b.scrollTop(0),void 0;c=this.findHighlightableChoices().find(".select2-result-label"),e=a(c[d]),f=e.offset().top+e.outerHeight(!0),d===c.length-1&&(i=b.find("li.select2-more-results"),i.length>0&&(f=i.offset().top+i.outerHeight(!0))),g=b.offset().top+b.outerHeight(!0),f>g&&b.scrollTop(b.scrollTop()+(f-g)),h=e.offset().top-b.offset().top,0>h&&"none"!=e.css("display")&&b.scrollTop(b.scrollTop()+h)}},findHighlightableChoices:function(){return this.results.find(".select2-result-selectable:not(.select2-disabled, .select2-selected)")},moveHighlight:function(b){for(var c=this.findHighlightableChoices(),d=this.highlight();d>-1&&d<c.length;){d+=b;var e=a(c[d]);if(e.hasClass("select2-result-selectable")&&!e.hasClass("select2-disabled")&&!e.hasClass("select2-selected")){this.highlight(d);break}}},highlight:function(b){var d,e,c=this.findHighlightableChoices();return 0===arguments.length?o(c.filter(".select2-highlighted")[0],c.get()):(b>=c.length&&(b=c.length-1),0>b&&(b=0),this.removeHighlight(),d=a(c[b]),d.addClass("select2-highlighted"),this.ensureHighlightVisible(),e=d.data("select2-data"),e&&this.opts.element.trigger({type:"select2-highlight",val:this.id(e),choice:e}),void 0)},removeHighlight:function(){this.results.find(".select2-highlighted").removeClass("select2-highlighted")},countSelectableResults:function(){return this.findHighlightableChoices().length},highlightUnderEvent:function(b){var c=a(b.target).closest(".select2-result-selectable");if(c.length>0&&!c.is(".select2-highlighted")){var d=this.findHighlightableChoices();this.highlight(d.index(c))}else 0==c.length&&this.removeHighlight()},loadMoreIfNeeded:function(){var c,a=this.results,b=a.find("li.select2-more-results"),d=this.resultsPage+1,e=this,f=this.search.val(),g=this.context;0!==b.length&&(c=b.offset().top-a.offset().top-a.height(),c<=this.opts.loadMorePadding&&(b.addClass("select2-active"),this.opts.query({element:this.opts.element,term:f,page:d,context:g,matcher:this.opts.matcher,callback:this.bind(function(c){e.opened()&&(e.opts.populateResults.call(this,a,c.results,{term:f,page:d,context:g}),e.postprocessResults(c,!1,!1),c.more===!0?(b.detach().appendTo(a).text(e.opts.formatLoadMore(d+1)),window.setTimeout(function(){e.loadMoreIfNeeded()},10)):b.remove(),e.positionDropdown(),e.resultsPage=d,e.context=c.context,this.opts.element.trigger({type:"select2-loaded",items:c}))})})))},tokenize:function(){},updateResults:function(c){function m(){d.removeClass("select2-active"),h.positionDropdown()}function n(a){e.html(a),m()}var g,i,l,d=this.search,e=this.results,f=this.opts,h=this,j=d.val(),k=a.data(this.container,"select2-last-term");if((c===!0||!k||!q(j,k))&&(a.data(this.container,"select2-last-term",j),c===!0||this.showSearchInput!==!1&&this.opened())){l=++this.queryCount;var o=this.getMaximumSelectionSize();if(o>=1&&(g=this.data(),a.isArray(g)&&g.length>=o&&J(f.formatSelectionTooBig,"formatSelectionTooBig")))return n("<li class='select2-selection-limit'>"+f.formatSelectionTooBig(o)+"</li>"),void 0;if(d.val().length<f.minimumInputLength)return J(f.formatInputTooShort,"formatInputTooShort")?n("<li class='select2-no-results'>"+f.formatInputTooShort(d.val(),f.minimumInputLength)+"</li>"):n(""),c&&this.showSearch&&this.showSearch(!0),void 0;
if(f.maximumInputLength&&d.val().length>f.maximumInputLength)return J(f.formatInputTooLong,"formatInputTooLong")?n("<li class='select2-no-results'>"+f.formatInputTooLong(d.val(),f.maximumInputLength)+"</li>"):n(""),void 0;f.formatSearching&&0===this.findHighlightableChoices().length&&n("<li class='select2-searching'>"+f.formatSearching()+"</li>"),d.addClass("select2-active"),this.removeHighlight(),i=this.tokenize(),i!=b&&null!=i&&d.val(i),this.resultsPage=1,f.query({element:f.element,term:d.val(),page:this.resultsPage,context:null,matcher:f.matcher,callback:this.bind(function(g){var i;if(l==this.queryCount){if(!this.opened())return this.search.removeClass("select2-active"),void 0;if(this.context=g.context===b?null:g.context,this.opts.createSearchChoice&&""!==d.val()&&(i=this.opts.createSearchChoice.call(h,d.val(),g.results),i!==b&&null!==i&&h.id(i)!==b&&null!==h.id(i)&&0===a(g.results).filter(function(){return q(h.id(this),h.id(i))}).length&&g.results.unshift(i)),0===g.results.length&&J(f.formatNoMatches,"formatNoMatches"))return n("<li class='select2-no-results'>"+f.formatNoMatches(d.val())+"</li>"),void 0;e.empty(),h.opts.populateResults.call(this,e,g.results,{term:d.val(),page:this.resultsPage,context:null}),g.more===!0&&J(f.formatLoadMore,"formatLoadMore")&&(e.append("<li class='select2-more-results'>"+h.opts.escapeMarkup(f.formatLoadMore(this.resultsPage))+"</li>"),window.setTimeout(function(){h.loadMoreIfNeeded()},10)),this.postprocessResults(g,c),m(),this.opts.element.trigger({type:"select2-loaded",items:g})}})})}},cancel:function(){this.close()},blur:function(){this.opts.selectOnBlur&&this.selectHighlighted({noFocus:!0}),this.close(),this.container.removeClass("select2-container-active"),this.search[0]===document.activeElement&&this.search.blur(),this.clearSearch(),this.selection.find(".select2-search-choice-focus").removeClass("select2-search-choice-focus")},focusSearch:function(){y(this.search)},selectHighlighted:function(a){var b=this.highlight(),c=this.results.find(".select2-highlighted"),d=c.closest(".select2-result").data("select2-data");d?(this.highlight(b),this.onSelect(d,a)):a&&a.noFocus&&this.close()},getPlaceholder:function(){var a;return this.opts.element.attr("placeholder")||this.opts.element.attr("data-placeholder")||this.opts.element.data("placeholder")||this.opts.placeholder||((a=this.getPlaceholderOption())!==b?a.text():b)},getPlaceholderOption:function(){if(this.select){var a=this.select.children("option").first();if(this.opts.placeholderOption!==b)return"first"===this.opts.placeholderOption&&a||"function"==typeof this.opts.placeholderOption&&this.opts.placeholderOption(this.select);if(""===a.text()&&""===a.val())return a}},initContainerWidth:function(){function c(){var c,d,e,f,g,h;if("off"===this.opts.width)return null;if("element"===this.opts.width)return 0===this.opts.element.outerWidth(!1)?"auto":this.opts.element.outerWidth(!1)+"px";if("copy"===this.opts.width||"resolve"===this.opts.width){if(c=this.opts.element.attr("style"),c!==b)for(d=c.split(";"),f=0,g=d.length;g>f;f+=1)if(h=d[f].replace(/\s/g,""),e=h.match(/^width:(([-+]?([0-9]*\.)?[0-9]+)(px|em|ex|%|in|cm|mm|pt|pc))/i),null!==e&&e.length>=1)return e[1];return"resolve"===this.opts.width?(c=this.opts.element.css("width"),c.indexOf("%")>0?c:0===this.opts.element.outerWidth(!1)?"auto":this.opts.element.outerWidth(!1)+"px"):null}return a.isFunction(this.opts.width)?this.opts.width():this.opts.width}var d=c.call(this);null!==d&&this.container.css("width",d)}}),e=N(d,{createContainer:function(){var b=a(document.createElement("div")).attr({"class":"select2-container"}).html(["<a href='javascript:void(0)' onclick='return false;' class='select2-choice' tabindex='-1'>","   <span class='select2-chosen'>&nbsp;</span><abbr class='select2-search-choice-close'></abbr>","   <span class='select2-arrow'><b></b></span>","</a>","<input class='select2-focusser select2-offscreen' type='text'/>","<div class='select2-drop select2-display-none'>","   <div class='select2-search'>","       <input type='text' autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' class='select2-input'/>","   </div>","   <ul class='select2-results'>","   </ul>","</div>"].join(""));return b},enableInterface:function(){this.parent.enableInterface.apply(this,arguments)&&this.focusser.prop("disabled",!this.isInterfaceEnabled())},opening:function(){var c,d,e;this.opts.minimumResultsForSearch>=0&&this.showSearch(!0),this.parent.opening.apply(this,arguments),this.showSearchInput!==!1&&this.search.val(this.focusser.val()),this.search.focus(),c=this.search.get(0),c.createTextRange?(d=c.createTextRange(),d.collapse(!1),d.select()):c.setSelectionRange&&(e=this.search.val().length,c.setSelectionRange(e,e)),""===this.search.val()&&this.nextSearchTerm!=b&&(this.search.val(this.nextSearchTerm),this.search.select()),this.focusser.prop("disabled",!0).val(""),this.updateResults(!0),this.opts.element.trigger(a.Event("select2-open"))},close:function(a){this.opened()&&(this.parent.close.apply(this,arguments),a=a||{focus:!0},this.focusser.removeAttr("disabled"),a.focus&&this.focusser.focus())},focus:function(){this.opened()?this.close():(this.focusser.removeAttr("disabled"),this.focusser.focus())},isFocused:function(){return this.container.hasClass("select2-container-active")},cancel:function(){this.parent.cancel.apply(this,arguments),this.focusser.removeAttr("disabled"),this.focusser.focus()},destroy:function(){a("label[for='"+this.focusser.attr("id")+"']").attr("for",this.opts.element.attr("id")),this.parent.destroy.apply(this,arguments)},initContainer:function(){var b,d=this.container,e=this.dropdown;this.opts.minimumResultsForSearch<0?this.showSearch(!1):this.showSearch(!0),this.selection=b=d.find(".select2-choice"),this.focusser=d.find(".select2-focusser"),this.focusser.attr("id","s2id_autogen"+g()),a("label[for='"+this.opts.element.attr("id")+"']").attr("for",this.focusser.attr("id")),this.focusser.attr("tabindex",this.elementTabIndex),this.search.on("keydown",this.bind(function(a){if(this.isInterfaceEnabled()){if(a.which===c.PAGE_UP||a.which===c.PAGE_DOWN)return A(a),void 0;switch(a.which){case c.UP:case c.DOWN:return this.moveHighlight(a.which===c.UP?-1:1),A(a),void 0;case c.ENTER:return this.selectHighlighted(),A(a),void 0;case c.TAB:return this.selectHighlighted({noFocus:!0}),void 0;case c.ESC:return this.cancel(a),A(a),void 0}}})),this.search.on("blur",this.bind(function(){document.activeElement===this.body().get(0)&&window.setTimeout(this.bind(function(){this.search.focus()}),0)})),this.focusser.on("keydown",this.bind(function(a){if(this.isInterfaceEnabled()&&a.which!==c.TAB&&!c.isControl(a)&&!c.isFunctionKey(a)&&a.which!==c.ESC){if(this.opts.openOnEnter===!1&&a.which===c.ENTER)return A(a),void 0;if(a.which==c.DOWN||a.which==c.UP||a.which==c.ENTER&&this.opts.openOnEnter){if(a.altKey||a.ctrlKey||a.shiftKey||a.metaKey)return;return this.open(),A(a),void 0}return a.which==c.DELETE||a.which==c.BACKSPACE?(this.opts.allowClear&&this.clear(),A(a),void 0):void 0}})),t(this.focusser),this.focusser.on("keyup-change input",this.bind(function(a){if(this.opts.minimumResultsForSearch>=0){if(a.stopPropagation(),this.opened())return;this.open()}})),b.on("mousedown","abbr",this.bind(function(a){this.isInterfaceEnabled()&&(this.clear(),B(a),this.close(),this.selection.focus())})),b.on("mousedown",this.bind(function(b){this.container.hasClass("select2-container-active")||this.opts.element.trigger(a.Event("select2-focus")),this.opened()?this.close():this.isInterfaceEnabled()&&this.open(),A(b)})),e.on("mousedown",this.bind(function(){this.search.focus()})),b.on("focus",this.bind(function(a){A(a)})),this.focusser.on("focus",this.bind(function(){this.container.hasClass("select2-container-active")||this.opts.element.trigger(a.Event("select2-focus")),this.container.addClass("select2-container-active")})).on("blur",this.bind(function(){this.opened()||(this.container.removeClass("select2-container-active"),this.opts.element.trigger(a.Event("select2-blur")))})),this.search.on("focus",this.bind(function(){this.container.hasClass("select2-container-active")||this.opts.element.trigger(a.Event("select2-focus")),this.container.addClass("select2-container-active")})),this.initContainerWidth(),this.opts.element.addClass("select2-offscreen"),this.setPlaceholder()},clear:function(b){var c=this.selection.data("select2-data");if(c){var d=a.Event("select2-clearing");if(this.opts.element.trigger(d),d.isDefaultPrevented())return;var e=this.getPlaceholderOption();this.opts.element.val(e?e.val():""),this.selection.find(".select2-chosen").empty(),this.selection.removeData("select2-data"),this.setPlaceholder(),b!==!1&&(this.opts.element.trigger({type:"select2-removed",val:this.id(c),choice:c}),this.triggerChange({removed:c}))}},initSelection:function(){if(this.isPlaceholderOptionSelected())this.updateSelection(null),this.close(),this.setPlaceholder();else{var c=this;this.opts.initSelection.call(null,this.opts.element,function(a){a!==b&&null!==a&&(c.updateSelection(a),c.close(),c.setPlaceholder())})}},isPlaceholderOptionSelected:function(){var a;return this.getPlaceholder()?(a=this.getPlaceholderOption())!==b&&a.prop("selected")||""===this.opts.element.val()||this.opts.element.val()===b||null===this.opts.element.val():!1},prepareOpts:function(){var b=this.parent.prepareOpts.apply(this,arguments),c=this;return"select"===b.element.get(0).tagName.toLowerCase()?b.initSelection=function(a,b){var d=a.find("option").filter(function(){return this.selected});b(c.optionToData(d))}:"data"in b&&(b.initSelection=b.initSelection||function(c,d){var e=c.val(),f=null;b.query({matcher:function(a,c,d){var g=q(e,b.id(d));return g&&(f=d),g},callback:a.isFunction(d)?function(){d(f)}:a.noop})}),b},getPlaceholder:function(){return this.select&&this.getPlaceholderOption()===b?b:this.parent.getPlaceholder.apply(this,arguments)},setPlaceholder:function(){var a=this.getPlaceholder();if(this.isPlaceholderOptionSelected()&&a!==b){if(this.select&&this.getPlaceholderOption()===b)return;this.selection.find(".select2-chosen").html(this.opts.escapeMarkup(a)),this.selection.addClass("select2-default"),this.container.removeClass("select2-allowclear")}},postprocessResults:function(a,b,c){var d=0,e=this;if(this.findHighlightableChoices().each2(function(a,b){return q(e.id(b.data("select2-data")),e.opts.element.val())?(d=a,!1):void 0}),c!==!1&&(b===!0&&d>=0?this.highlight(d):this.highlight(0)),b===!0){var g=this.opts.minimumResultsForSearch;g>=0&&this.showSearch(L(a.results)>=g)}},showSearch:function(b){this.showSearchInput!==b&&(this.showSearchInput=b,this.dropdown.find(".select2-search").toggleClass("select2-search-hidden",!b),this.dropdown.find(".select2-search").toggleClass("select2-offscreen",!b),a(this.dropdown,this.container).toggleClass("select2-with-searchbox",b))},onSelect:function(a,b){if(this.triggerSelect(a)){var c=this.opts.element.val(),d=this.data();this.opts.element.val(this.id(a)),this.updateSelection(a),this.opts.element.trigger({type:"select2-selected",val:this.id(a),choice:a}),this.nextSearchTerm=this.opts.nextSearchTerm(a,this.search.val()),this.close(),b&&b.noFocus||this.focusser.focus(),q(c,this.id(a))||this.triggerChange({added:a,removed:d})}},updateSelection:function(a){var d,e,c=this.selection.find(".select2-chosen");this.selection.data("select2-data",a),c.empty(),null!==a&&(d=this.opts.formatSelection(a,c,this.opts.escapeMarkup)),d!==b&&c.append(d),e=this.opts.formatSelectionCssClass(a,c),e!==b&&c.addClass(e),this.selection.removeClass("select2-default"),this.opts.allowClear&&this.getPlaceholder()!==b&&this.container.addClass("select2-allowclear")},val:function(){var a,c=!1,d=null,e=this,f=this.data();if(0===arguments.length)return this.opts.element.val();if(a=arguments[0],arguments.length>1&&(c=arguments[1]),this.select)this.select.val(a).find("option").filter(function(){return this.selected}).each2(function(a,b){return d=e.optionToData(b),!1}),this.updateSelection(d),this.setPlaceholder(),c&&this.triggerChange({added:d,removed:f});else{if(!a&&0!==a)return this.clear(c),void 0;if(this.opts.initSelection===b)throw new Error("cannot call val() if initSelection() is not defined");this.opts.element.val(a),this.opts.initSelection(this.opts.element,function(a){e.opts.element.val(a?e.id(a):""),e.updateSelection(a),e.setPlaceholder(),c&&e.triggerChange({added:a,removed:f})})}},clearSearch:function(){this.search.val(""),this.focusser.val("")},data:function(a){var c,d=!1;return 0===arguments.length?(c=this.selection.data("select2-data"),c==b&&(c=null),c):(arguments.length>1&&(d=arguments[1]),a?(c=this.data(),this.opts.element.val(a?this.id(a):""),this.updateSelection(a),d&&this.triggerChange({added:a,removed:c})):this.clear(d),void 0)}}),f=N(d,{createContainer:function(){var b=a(document.createElement("div")).attr({"class":"select2-container select2-container-multi"}).html(["<ul class='select2-choices'>","  <li class='select2-search-field'>","    <input type='text' autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' class='select2-input'>","  </li>","</ul>","<div class='select2-drop select2-drop-multi select2-display-none'>","   <ul class='select2-results'>","   </ul>","</div>"].join(""));return b},prepareOpts:function(){var b=this.parent.prepareOpts.apply(this,arguments),c=this;return"select"===b.element.get(0).tagName.toLowerCase()?b.initSelection=function(a,b){var d=[];a.find("option").filter(function(){return this.selected}).each2(function(a,b){d.push(c.optionToData(b))}),b(d)}:"data"in b&&(b.initSelection=b.initSelection||function(c,d){var e=r(c.val(),b.separator),f=[];b.query({matcher:function(c,d,g){var h=a.grep(e,function(a){return q(a,b.id(g))}).length;return h&&f.push(g),h},callback:a.isFunction(d)?function(){for(var a=[],c=0;c<e.length;c++)for(var g=e[c],h=0;h<f.length;h++){var i=f[h];if(q(g,b.id(i))){a.push(i),f.splice(h,1);break}}d(a)}:a.noop})}),b},selectChoice:function(a){var b=this.container.find(".select2-search-choice-focus");b.length&&a&&a[0]==b[0]||(b.length&&this.opts.element.trigger("choice-deselected",b),b.removeClass("select2-search-choice-focus"),a&&a.length&&(this.close(),a.addClass("select2-search-choice-focus"),this.opts.element.trigger("choice-selected",a)))},destroy:function(){a("label[for='"+this.search.attr("id")+"']").attr("for",this.opts.element.attr("id")),this.parent.destroy.apply(this,arguments)},initContainer:function(){var d,b=".select2-choices";this.searchContainer=this.container.find(".select2-search-field"),this.selection=d=this.container.find(b);var e=this;this.selection.on("click",".select2-search-choice:not(.select2-locked)",function(){e.search[0].focus(),e.selectChoice(a(this))}),this.search.attr("id","s2id_autogen"+g()),a("label[for='"+this.opts.element.attr("id")+"']").attr("for",this.search.attr("id")),this.search.on("input paste",this.bind(function(){this.isInterfaceEnabled()&&(this.opened()||this.open())})),this.search.attr("tabindex",this.elementTabIndex),this.keydowns=0,this.search.on("keydown",this.bind(function(a){if(this.isInterfaceEnabled()){++this.keydowns;var b=d.find(".select2-search-choice-focus"),e=b.prev(".select2-search-choice:not(.select2-locked)"),f=b.next(".select2-search-choice:not(.select2-locked)"),g=z(this.search);if(b.length&&(a.which==c.LEFT||a.which==c.RIGHT||a.which==c.BACKSPACE||a.which==c.DELETE||a.which==c.ENTER)){var h=b;return a.which==c.LEFT&&e.length?h=e:a.which==c.RIGHT?h=f.length?f:null:a.which===c.BACKSPACE?(this.unselect(b.first()),this.search.width(10),h=e.length?e:f):a.which==c.DELETE?(this.unselect(b.first()),this.search.width(10),h=f.length?f:null):a.which==c.ENTER&&(h=null),this.selectChoice(h),A(a),h&&h.length||this.open(),void 0}if((a.which===c.BACKSPACE&&1==this.keydowns||a.which==c.LEFT)&&0==g.offset&&!g.length)return this.selectChoice(d.find(".select2-search-choice:not(.select2-locked)").last()),A(a),void 0;if(this.selectChoice(null),this.opened())switch(a.which){case c.UP:case c.DOWN:return this.moveHighlight(a.which===c.UP?-1:1),A(a),void 0;case c.ENTER:return this.selectHighlighted(),A(a),void 0;case c.TAB:return this.selectHighlighted({noFocus:!0}),this.close(),void 0;case c.ESC:return this.cancel(a),A(a),void 0}if(a.which!==c.TAB&&!c.isControl(a)&&!c.isFunctionKey(a)&&a.which!==c.BACKSPACE&&a.which!==c.ESC){if(a.which===c.ENTER){if(this.opts.openOnEnter===!1)return;if(a.altKey||a.ctrlKey||a.shiftKey||a.metaKey)return}this.open(),(a.which===c.PAGE_UP||a.which===c.PAGE_DOWN)&&A(a),a.which===c.ENTER&&A(a)}}})),this.search.on("keyup",this.bind(function(){this.keydowns=0,this.resizeSearch()})),this.search.on("blur",this.bind(function(b){this.container.removeClass("select2-container-active"),this.search.removeClass("select2-focused"),this.selectChoice(null),this.opened()||this.clearSearch(),b.stopImmediatePropagation(),this.opts.element.trigger(a.Event("select2-blur"))})),this.container.on("click",b,this.bind(function(b){this.isInterfaceEnabled()&&(a(b.target).closest(".select2-search-choice").length>0||(this.selectChoice(null),this.clearPlaceholder(),this.container.hasClass("select2-container-active")||this.opts.element.trigger(a.Event("select2-focus")),this.open(),this.focusSearch(),b.preventDefault()))})),this.container.on("focus",b,this.bind(function(){this.isInterfaceEnabled()&&(this.container.hasClass("select2-container-active")||this.opts.element.trigger(a.Event("select2-focus")),this.container.addClass("select2-container-active"),this.dropdown.addClass("select2-drop-active"),this.clearPlaceholder())})),this.initContainerWidth(),this.opts.element.addClass("select2-offscreen"),this.clearSearch()},enableInterface:function(){this.parent.enableInterface.apply(this,arguments)&&this.search.prop("disabled",!this.isInterfaceEnabled())},initSelection:function(){if(""===this.opts.element.val()&&""===this.opts.element.text()&&(this.updateSelection([]),this.close(),this.clearSearch()),this.select||""!==this.opts.element.val()){var c=this;this.opts.initSelection.call(null,this.opts.element,function(a){a!==b&&null!==a&&(c.updateSelection(a),c.close(),c.clearSearch())})}},clearSearch:function(){var a=this.getPlaceholder(),c=this.getMaxSearchWidth();a!==b&&0===this.getVal().length&&this.search.hasClass("select2-focused")===!1?(this.search.val(a).addClass("select2-default"),this.search.width(c>0?c:this.container.css("width"))):this.search.val("").width(10)},clearPlaceholder:function(){this.search.hasClass("select2-default")&&this.search.val("").removeClass("select2-default")},opening:function(){this.clearPlaceholder(),this.resizeSearch(),this.parent.opening.apply(this,arguments),this.focusSearch(),this.updateResults(!0),this.search.focus(),this.opts.element.trigger(a.Event("select2-open"))},close:function(){this.opened()&&this.parent.close.apply(this,arguments)},focus:function(){this.close(),this.search.focus()},isFocused:function(){return this.search.hasClass("select2-focused")},updateSelection:function(b){var c=[],d=[],e=this;a(b).each(function(){o(e.id(this),c)<0&&(c.push(e.id(this)),d.push(this))}),b=d,this.selection.find(".select2-search-choice").remove(),a(b).each(function(){e.addSelectedChoice(this)}),e.postprocessResults()},tokenize:function(){var a=this.search.val();a=this.opts.tokenizer.call(this,a,this.data(),this.bind(this.onSelect),this.opts),null!=a&&a!=b&&(this.search.val(a),a.length>0&&this.open())},onSelect:function(a,b){this.triggerSelect(a)&&(this.addSelectedChoice(a),this.opts.element.trigger({type:"selected",val:this.id(a),choice:a}),(this.select||!this.opts.closeOnSelect)&&this.postprocessResults(a,!1,this.opts.closeOnSelect===!0),this.opts.closeOnSelect?(this.close(),this.search.width(10)):this.countSelectableResults()>0?(this.search.width(10),this.resizeSearch(),this.getMaximumSelectionSize()>0&&this.val().length>=this.getMaximumSelectionSize()&&this.updateResults(!0),this.positionDropdown()):(this.close(),this.search.width(10)),this.triggerChange({added:a}),b&&b.noFocus||this.focusSearch())},cancel:function(){this.close(),this.focusSearch()},addSelectedChoice:function(c){var j,k,d=!c.locked,e=a("<li class='select2-search-choice'>    <div></div>    <a href='#' onclick='return false;' class='select2-search-choice-close' tabindex='-1'></a></li>"),f=a("<li class='select2-search-choice select2-locked'><div></div></li>"),g=d?e:f,h=this.id(c),i=this.getVal();j=this.opts.formatSelection(c,g.find("div"),this.opts.escapeMarkup),j!=b&&g.find("div").replaceWith("<div>"+j+"</div>"),k=this.opts.formatSelectionCssClass(c,g.find("div")),k!=b&&g.addClass(k),d&&g.find(".select2-search-choice-close").on("mousedown",A).on("click dblclick",this.bind(function(b){this.isInterfaceEnabled()&&(a(b.target).closest(".select2-search-choice").fadeOut("fast",this.bind(function(){this.unselect(a(b.target)),this.selection.find(".select2-search-choice-focus").removeClass("select2-search-choice-focus"),this.close(),this.focusSearch()})).dequeue(),A(b))})).on("focus",this.bind(function(){this.isInterfaceEnabled()&&(this.container.addClass("select2-container-active"),this.dropdown.addClass("select2-drop-active"))})),g.data("select2-data",c),g.insertBefore(this.searchContainer),i.push(h),this.setVal(i)},unselect:function(b){var d,e,c=this.getVal();if(b=b.closest(".select2-search-choice"),0===b.length)throw"Invalid argument: "+b+". Must be .select2-search-choice";if(d=b.data("select2-data")){for(;(e=o(this.id(d),c))>=0;)c.splice(e,1),this.setVal(c),this.select&&this.postprocessResults();var f=a.Event("select2-removing");f.val=this.id(d),f.choice=d,this.opts.element.trigger(f),f.isDefaultPrevented()||(b.remove(),this.opts.element.trigger({type:"select2-removed",val:this.id(d),choice:d}),this.triggerChange({removed:d}))}},postprocessResults:function(a,b,c){var d=this.getVal(),e=this.results.find(".select2-result"),f=this.results.find(".select2-result-with-children"),g=this;e.each2(function(a,b){var c=g.id(b.data("select2-data"));o(c,d)>=0&&(b.addClass("select2-selected"),b.find(".select2-result-selectable").addClass("select2-selected"))}),f.each2(function(a,b){b.is(".select2-result-selectable")||0!==b.find(".select2-result-selectable:not(.select2-selected)").length||b.addClass("select2-selected")}),-1==this.highlight()&&c!==!1&&g.highlight(0),!this.opts.createSearchChoice&&!e.filter(".select2-result:not(.select2-selected)").length>0&&(!a||a&&!a.more&&0===this.results.find(".select2-no-results").length)&&J(g.opts.formatNoMatches,"formatNoMatches")&&this.results.append("<li class='select2-no-results'>"+g.opts.formatNoMatches(g.search.val())+"</li>")},getMaxSearchWidth:function(){return this.selection.width()-s(this.search)},resizeSearch:function(){var a,b,c,d,e,f=s(this.search);a=C(this.search)+10,b=this.search.offset().left,c=this.selection.width(),d=this.selection.offset().left,e=c-(b-d)-f,a>e&&(e=c-f),40>e&&(e=c-f),0>=e&&(e=a),this.search.width(Math.floor(e))},getVal:function(){var a;return this.select?(a=this.select.val(),null===a?[]:a):(a=this.opts.element.val(),r(a,this.opts.separator))},setVal:function(b){var c;this.select?this.select.val(b):(c=[],a(b).each(function(){o(this,c)<0&&c.push(this)}),this.opts.element.val(0===c.length?"":c.join(this.opts.separator)))},buildChangeDetails:function(a,b){for(var b=b.slice(0),a=a.slice(0),c=0;c<b.length;c++)for(var d=0;d<a.length;d++)q(this.opts.id(b[c]),this.opts.id(a[d]))&&(b.splice(c,1),c>0&&c--,a.splice(d,1),d--);return{added:b,removed:a}},val:function(c,d){var e,f=this;if(0===arguments.length)return this.getVal();if(e=this.data(),e.length||(e=[]),!c&&0!==c)return this.opts.element.val(""),this.updateSelection([]),this.clearSearch(),d&&this.triggerChange({added:this.data(),removed:e}),void 0;if(this.setVal(c),this.select)this.opts.initSelection(this.select,this.bind(this.updateSelection)),d&&this.triggerChange(this.buildChangeDetails(e,this.data()));else{if(this.opts.initSelection===b)throw new Error("val() cannot be called if initSelection() is not defined");this.opts.initSelection(this.opts.element,function(b){var c=a.map(b,f.id);f.setVal(c),f.updateSelection(b),f.clearSearch(),d&&f.triggerChange(f.buildChangeDetails(e,f.data()))})}this.clearSearch()},onSortStart:function(){if(this.select)throw new Error("Sorting of elements is not supported when attached to <select>. Attach to <input type='hidden'/> instead.");this.search.width(0),this.searchContainer.hide()},onSortEnd:function(){var b=[],c=this;this.searchContainer.show(),this.searchContainer.appendTo(this.searchContainer.parent()),this.resizeSearch(),this.selection.find(".select2-search-choice").each(function(){b.push(c.opts.id(a(this).data("select2-data")))}),this.setVal(b),this.triggerChange()},data:function(b,c){var e,f,d=this;return 0===arguments.length?this.selection.find(".select2-search-choice").map(function(){return a(this).data("select2-data")}).get():(f=this.data(),b||(b=[]),e=a.map(b,function(a){return d.opts.id(a)}),this.setVal(e),this.updateSelection(b),this.clearSearch(),c&&this.triggerChange(this.buildChangeDetails(f,this.data())),void 0)}}),a.fn.select2=function(){var d,g,h,i,j,c=Array.prototype.slice.call(arguments,0),k=["val","destroy","opened","open","close","focus","isFocused","container","dropdown","onSortStart","onSortEnd","enable","disable","readonly","positionDropdown","data","search"],l=["opened","isFocused","container","dropdown"],m=["val","data"],n={search:"externalSearch"};return this.each(function(){if(0===c.length||"object"==typeof c[0])d=0===c.length?{}:a.extend({},c[0]),d.element=a(this),"select"===d.element.get(0).tagName.toLowerCase()?j=d.element.prop("multiple"):(j=d.multiple||!1,"tags"in d&&(d.multiple=j=!0)),g=j?new f:new e,g.init(d);else{if("string"!=typeof c[0])throw"Invalid arguments to select2 plugin: "+c;if(o(c[0],k)<0)throw"Unknown method: "+c[0];if(i=b,g=a(this).data("select2"),g===b)return;if(h=c[0],"container"===h?i=g.container:"dropdown"===h?i=g.dropdown:(n[h]&&(h=n[h]),i=g[h].apply(g,c.slice(1))),o(c[0],l)>=0||o(c[0],m)&&1==c.length)return!1}}),i===b?this:i},a.fn.select2.defaults={width:"copy",loadMorePadding:0,closeOnSelect:!0,openOnEnter:!0,containerCss:{},dropdownCss:{},containerCssClass:"",dropdownCssClass:"",formatResult:function(a,b,c,d){var e=[];return E(a.text,c.term,e,d),e.join("")},formatSelection:function(a,c,d){return a?d(a.text):b},sortResults:function(a){return a},formatResultCssClass:function(){return b},formatSelectionCssClass:function(){return b},formatNoMatches:function(){return"No matches found"},formatInputTooShort:function(a,b){var c=b-a.length;return"Please enter "+c+" more character"+(1==c?"":"s")},formatInputTooLong:function(a,b){var c=a.length-b;return"Please delete "+c+" character"+(1==c?"":"s")},formatSelectionTooBig:function(a){return"You can only select "+a+" item"+(1==a?"":"s")},formatLoadMore:function(){return"Loading more results..."},formatSearching:function(){return"Searching..."},minimumResultsForSearch:0,minimumInputLength:0,maximumInputLength:null,maximumSelectionSize:0,id:function(a){return a.id},matcher:function(a,b){return n(""+b).toUpperCase().indexOf(n(""+a).toUpperCase())>=0},separator:",",tokenSeparators:[],tokenizer:M,escapeMarkup:F,blurOnChange:!1,selectOnBlur:!1,adaptContainerCssClass:function(a){return a},adaptDropdownCssClass:function(){return null},nextSearchTerm:function(){return b}},a.fn.select2.ajaxDefaults={transport:a.ajax,params:{type:"GET",cache:!1,dataType:"json"}},window.Select2={query:{ajax:G,local:H,tags:I},util:{debounce:v,markMatch:E,escapeMarkup:F,stripDiacritics:n},"class":{"abstract":d,single:e,multi:f}}}}(jQuery);
// Freshdesk session cookies
if(session){
	if(!($.cookie("fd_fr"))){$.cookie("fd_fr",session["current_session"]["referrer"],{expires:365});}
	if(!($.cookie("fd_flu"))){$.cookie("fd_flu",session["current_session"]["url"],{expires:365});}
	if(!($.cookie("fd_se"))){$.cookie("fd_se",session["current_session"]["search"]["engine"],{expires:365});}
	if(!($.cookie("fd_sq"))){$.cookie("fd_sq",session["current_session"]["search"]["query"],{expires:365});}

	var visits = ($.cookie("fd_vi"))||0;
	$.cookie("fd_vi", (parseInt(visits)+1),{expires:365});
}
;
(function ($) {
  // writes the string
  //
  // @param jQuery $target
  // @param String str
  // @param Numeric cursor
  // @param Numeric delay
  // @param Function cb
  // @return void
  function typeString($target, str, cursor, delay, cb) {
    $target.html(function (_, html) {
      return html + str[cursor];
    });
    
    if (cursor < str.length - 1) {
      setTimeout(function () {
        typeString($target, str, cursor + 1, delay, cb);
      }, delay);
    }
    else {
      cb();
    }
  }
  
  // clears the string
  //
  // @param jQuery $target
  // @param Numeric delay
  // @param Function cb
  // @return void
  function deleteString($target, delay, cb) {
    var length;
    
    $target.html(function (_, html) {
      length = html.length;
      return html.substr(0, length - 1);
    });
    
    if (length > 1) {
      setTimeout(function () {
        deleteString($target, delay, cb);
      }, delay);
    }
    else {
      cb();
    }
  }

  // jQuery hook
  $.fn.extend({
    teletype: function (opts) {
      var settings = $.extend({}, $.teletype.defaults, opts);
      
      return $(this).each(function () {
        (function loop($tar, idx) {
          // type
          typeString($tar, settings.text[idx], 0, settings.delay, function () {
            // delete
            setTimeout(function () {
              deleteString($tar, settings.delay, function () {
                loop($tar, (idx + 1) % settings.text.length);
              });
            }, settings.pause);
          });
        
        }($(this), 0));
      });
    }
  });

  // plugin defaults  
  $.extend({
    teletype: {
      defaults: {
        delay: 100,
        pause: 2000,
        text: []
      }
    }
  });
}(jQuery));
/**
 * jQuery Unveil
 * A very lightweight jQuery plugin to lazy load images
 * http://luis-almeida.github.com/unveil
 *
 * Licensed under the MIT license.
 * Copyright 2013 Luís Almeida
 * https://github.com/luis-almeida
 */


;(function($) {

  $.fn.unveil = function(threshold, callback) {

    var $w = $(window),
        th = threshold || 0,
        retina = window.devicePixelRatio > 1,
        attrib = retina? "data-src-retina" : "data-src",
        images = this,
        loaded;

    this.one("unveil", function() {
      var source = this.getAttribute(attrib);
      source = source || this.getAttribute("data-src");
      if (source) {
        this.setAttribute("src", source);
        if (typeof callback === "function") callback.call(this);
      }
    });

    function unveil() {
      var inview = images.filter(function() {
        var $e = $(this);
        if ($e.is(":hidden")) return;

        var wt = $w.scrollTop(),
            wb = wt + $w.height(),
            et = $e.offset().top,
            eb = et + $e.height();

        return eb >= wt - th && et <= wb + th;
      });

      loaded = inview.trigger("unveil");
      images = images.not(loaded);
    }

    $w.scroll(unveil);
    $w.resize(unveil);

    unveil();

    return this;

  };

})(window.jQuery || window.Zepto);
(function () {

	var pricing = {
		"US":{
			"symbol":"$",
			"estate_annual" : 40,
			"blossom_annual": 16,
			"garden_annual" : 25,
			"forest_annual" : 70,
			"estate_monthly" : 49,
			"blossom_monthly": 19,
			"garden_monthly" : 29,
			"sprout_monthly" : 15,
			"forest_monthly" : 79,
			"estate_day_pass" : 3,
			"blossom_day_pass": 2,
			"garden_day_pass" : 2,
			"sprout_day_pass" : 1,
			"forest_day_pass" : 3,
			"sprout_additional_agent": 15
		},

		"EU" : {
			"symbol":"€",
			"estate_annual" : 32,
			"blossom_annual": 14,
			"garden_annual" : 20,
			"forest_annual" : 56,
			"estate_monthly" : 40,
			"blossom_monthly": 16,
			"garden_monthly" : 25,
			"sprout_monthly" : 12,
			"forest_monthly" : 62,
			"estate_day_pass" : 3,
			"blossom_day_pass": 2,
			"garden_day_pass" : 2,
			"sprout_day_pass" : 1,
			"forest_day_pass" : 3,
			"sprout_additional_agent": 12
		},
		"ZAR":{
			"symbol":"R",
			"estate_annual" : 449,
			"blossom_annual": 189,
			"garden_annual" : 289,
			"forest_annual" : 789,
			"estate_monthly" : 549,
			"blossom_monthly": 229,
			"garden_monthly" : 349,
			"sprout_monthly" : 169,
			"forest_monthly" : 889,
			"estate_day_pass" : 35,
			"blossom_day_pass": 25,
			"garden_day_pass" : 25,
			"sprout_day_pass" : 15,
			"forest_day_pass" : 35,
			"sprout_additional_agent": 169
		},
		"IN":{
			"symbol":"₹",
			"estate_annual" : 2499,
			"blossom_annual": 999,
			"garden_annual" : 1499,
			"forest_annual" : 4499,
			"estate_monthly" : 2999,
			"blossom_monthly": 1199,
			"garden_monthly" : 1799,
			"sprout_monthly" : 899,
			"forest_monthly" : 4999,
			"estate_day_pass" : 180,
			"blossom_day_pass": 120,
			"garden_day_pass" : 120,
			"sprout_day_pass" : 60,
			"forest_day_pass" : 180,
			"sprout_additional_agent": 899
		}
	};

	var phone_no = {
		"US":{ "number": "+1 (866) 832-3090" },
		"UK":{ "number": "+44 (800) 808-5790" },
		"AUS":{ "number": "+61 (894) 687-228" }
	};
	
	try{
		var countryEU = ["AUSTRIA", "BELGIUM", "CYPRUS", "ESTONIA", "FINLAND", "FRANCE", "GERMANY", "GREECE", "IRELAND", "ITALY", "LATVIA", "LUXEMBOURG", "MALTA", "NETHERLANDS", "PORTUGAL", "SLOVAKIA", "SLOVENIA", "SPAIN", "ANDORRA", "KOSOVO", "MONTENEGRO", "MONACO", "SAN MARINO", "THE VATICAN CITY"];

		var currentLocation = $.cookie("location") || { countryCode: "US" };
		currentLocation = JSON.parse(currentLocation);

		var countryCode = currentLocation.countryCode,
			countryName = currentLocation.countryName,
			countrySelected;
		if( $.inArray(countryName, countryEU)!== -1 ) {
			countrySelected = "EU"
		}else{
			countrySelected = countryCode;
		}

		var CountryPricing  = pricing[countrySelected];

		$(".currency-symbol").html(CountryPricing["symbol"]);

		$('.plans').each(function(){
			$(this).html(CountryPricing[$(this).data('plan')])
		});

		// footer Phone Number
		var phoneNumber = phone_no[countrySelected];

		$(".f-contact .f-phone span").html(phoneNumber['number']);
		
	}catch(ex){

	}

}());
(function ($) {

$('[id^=feature-]').on('click', function(){
	$(this).toggleClass('active');
});


// waypoint sticky stop
$('.p-feature').last().addClass('stick-stop');


// Number Spinner
function Addtion(){

	$('.numb-spinner input').val( parseInt($('.numb-spinner input').val(), 10) + 1);
}

function Subraction(){
	$('.numb-spinner input').val( parseInt($('.numb-spinner input').val(), 10) - 1);
}

$('.numb-spinner .caret-up').on('click', function() {
	if($(".input-control").val()!= ""){
	 Addtion();
	 freshPlan();
	 Competitorplan();	
	 plansName(fresh_largest,largest);
	 Nullarray();
	}else{
		$(".input-control").val(0)
	}
});

$('.numb-spinner .caret-down').on('click', function() {
	if($(".input-control").val()>0){
		Subraction();
		freshPlan();
		Competitorplan();	
		plansName(fresh_largest,largest);
		Nullarray();
	}	
});


// Pricing Comparison
var comparison = {
	'email_ticketing' 		:{ 'freshdesk':0,  'zendesk':1,  'desk':3,  'service_cloud':65  },
	'automatic_ticket'		:{ 'freshdesk':0,  'zendesk':25, 'desk':3,  'service_cloud':65  },
	'knowledge_base'		:{ 'freshdesk':0,  'zendesk':1,  'desk':3,  'service_cloud':260 },
	'live_chat'  			:{ 'freshdesk':25, 'zendesk':25, 'desk':30, 'service_cloud':260 },
	'phone_support'  		:{ 'freshdesk':0,  'zendesk':1,  'desk':3,  'service_cloud':65  },
	'community_forums'  	:{ 'freshdesk':16, 'zendesk':25, 'desk':30, 'service_cloud':135 },
	'multiple_accounts'  	:{ 'freshdesk':16, 'zendesk':25, 'desk':30, 'service_cloud':135 },
	'reporting_analytics'	:{ 'freshdesk':0,  'zendesk':1,  'desk':30, 'service_cloud':65  },
	'multi_languages'		:{ 'freshdesk':25, 'zendesk':59, 'desk':30, 'service_cloud':65  },
	'CSS_customizations'	:{ 'freshdesk':25, 'zendesk':25, 'desk':30, 'service_cloud':135 },
	'muitple_products'		:{ 'freshdesk':25, 'zendesk':125,'desk':50, 'service_cloud':0	},
	'email_support'			:{ 'freshdesk':0,  'zendesk':59, 'desk':50, 'service_cloud':260 }
}

// pricing plan
var plans = {
	'freshdesk' 	: { '0'	 :'sprout', 	  '15'	: 'sprout', 	'16' : 'blossom', '25'  : 'garden'	  },
	'zendesk' 		: { '1'	 :'starter',	  '25'	: 'regular',	'59' : 'plus',	  '125' : 'enterprise'},
	'desk'			: { '3'	 : 'starter',	  '30' 	: 'standard',	'50' : 'plus'		},
	'service_cloud' : { '65' : 'professional','135' : 'enterprise', '260': 'performance'}
}

// Global Variables
	var companyName = 'zendesk',
		agentCount = 10,
		starter_agent,
		self_array = [],
		others_array = [],
		self,
		others,
		fresh_largest,
		largest,
		data;

var companyName = $('.pricing-cal h1 span').data("company");
var className = $('#other-logo').attr('class');
$('#other-logo').removeClass(className).addClass(companyName);



// Agent Count Spinner
$('.numb-spinner').on('click',function(){
	agentCount = $('.input-control').val();							// Getting the No. of Agents
		freshPlan();	
		Competitorplan();	
		plansName(fresh_largest,largest);
		Nullarray();
});
  

// Agent Count using Keypress
$('.numb-spinner').on('keyup',function(e){
	var code = e.which;
	if(code == 38){													// Keycode for Up arrow key
		if($(".input-control").val()!= ""){
			Addtion();
			agentCount = $('.input-control').val();					// Getting the N0. of Agents using Keypress
			freshPlan();	
			Competitorplan();	
			plansName(fresh_largest,largest);
			Nullarray();
		}else{
			$(".input-control").val(0);
		}
		
	}
	else if(code == 40){											// Keycode for down arrow key
		if($(".input-control").val()>0){
			Subraction();
			agentCount = $('.input-control').val();
			freshPlan();	
			Competitorplan();		
			plansName(fresh_largest,largest);
			Nullarray();
		}
	}
	else if(code == 13){											// KeyCode for Enter
		agentCount = $('.input-control').val();
		freshPlan();	
		Competitorplan();		
		plansName(fresh_largest,largest);
		Nullarray();
	}
});


//  Restricting the text in Agent Count
$('.input-control').keydown(function(event) {
    // Allow special chars + arrows 
    if (event.keyCode == 46 || event.keyCode == 8 || event.keyCode == 9 
        || event.keyCode == 27 || event.keyCode == 13 
        || (event.keyCode == 65 && event.ctrlKey === true) 
        || (event.keyCode >= 35 && event.keyCode <= 39)){
            return;
    }else {
        // If it's not a number stop the keypress
        if (event.shiftKey || (event.keyCode < 48 || event.keyCode > 57) && (event.keyCode < 96 || event.keyCode > 105 )) {
            event.preventDefault(); 
        }   
    }
});



// if the sprout is out of free plan
function freeplan(className,starterPricing){
	var starter;
	starter_agent = agentCount - 3;												// If agent is greater than 4 in sprout plan
	starter = (starterPricing)*(starter_agent);
	$('.'+className).html('$'+starter);
}


// logic starter plan
function freshPlan(push){
	var sprout=15;

	fresh_pricing(push);

	if(agentCount >= 4 && fresh_largest < 15){
		freeplan('fd-feature-pricing',sprout);
	}
	else{
		pricingOutput('fd-feature-pricing', fresh_largest);
	}
}


function fresh_pricing(push){
	if(push){
		self_array.push(comparison[data]['freshdesk']);							// Pushing the value of feature in to an array
	}
	fresh_largest = Math.max.apply(Math, self_array);							// Finding the largest Value
}



// Competitor plan
function Competitorplan(push){
	var competetorPricing = {
			zendesk : 25,
			desk : 30,
			service_cloud : 0
		}; 

	competitor_pricing(push);

	if(agentCount >= 4 &&  largest < 16 ){										// if Agent is out of free plan 
		freeplan('other-feature-pricing',competetorPricing[companyName]);
	}
	else {
		pricingOutput('other-feature-pricing', largest);
	}
}


function competitor_pricing(push){
	if(push){
		others_array.push(comparison[data][companyName]);
	}
	largest = Math.max.apply(Math, others_array);
}


function pricingOutput(className, largest){
	var output = (largest)*(agentCount)||0;										// Mulitplying the price with no. of agents
	$('.'+className).html('$'+output);
}


function Nullarray(){	
		if(others_array.length === 0){
			$('.fd-feature-pricing,.other-feature-pricing').html('$0');
		}	
}

function deseletedPricing(){
	var fresh_index,
		other_index,
		sprout = 15,
		competetorPricing = {
			zendesk : 25,
			desk : 30,
			service_cloud : 0
		}; 

		self = comparison[data]['freshdesk'];
		others = comparison[data][companyName];

		fresh_index = self_array.indexOf(self);									// Finding the Index Value
		other_index = others_array.indexOf(others);	
		
		self_array.splice(fresh_index, 1);										// Removing the Index value	
		
		others_array.splice(other_index, 1);

		var other_largest = Math.max.apply(Math, others_array);  				// Finding the largest price in the array

		if(agentCount >= 4 && other_largest < 16){
			freeplan('other-feature-pricing',competetorPricing[companyName]);
		}
		else{
			pricingOutput('other-feature-pricing', other_largest);
		}

		var self_largest = Math.max.apply(Math, self_array);  					// Finding the largest price in the array

		if(agentCount >= 4 && self_largest < 15){
			freeplan('fd-feature-pricing',sprout);
		}else{
			pricingOutput('fd-feature-pricing', self_largest);
		}		

		plansName(self_largest,other_largest);

		Nullarray();
}

//Getting Plan name according to the pricing of helopdesk
function plansName(freshlargest,otherlargest){
	var competitor_plan = {
		'zendesk' : 'regular',
		'desk': 'standard'
	}

	var freshPlan = plans['freshdesk'][freshlargest];
	$('.freshplan').html(freshPlan);

	if(agentCount >= 4 && otherlargest < 24){
		var competetorPlan = competitor_plan[companyName];
	}else{
		competetorPlan = plans[companyName][otherlargest];
	}
	
	$('.competetor-plan').html(competetorPlan);
}


// Features selection
$('.p-feature').click(function(ev){
	ev.preventDefault();
	data = $(this).data('feature');
	$('.fd-plan,.cr-plan').css('display','block');

	if($(this).hasClass('active')){
		self = comparison[data]['freshdesk'];
		others = comparison[data][companyName];
		freshPlan(true);
		Competitorplan(true);
		plansName(fresh_largest,largest);
	}
	else{
		deseletedPricing();		
	}
	
});

try{
	var id_name = ['feature-mail','feature-automation', 'feature-knowledge', 'feature-phone', 'feature-analytics', 'feature-support'];

	$.each(id_name, function(index, value){
		var sprout_plan = $('.features #'+value).addClass('active');
		data = $(sprout_plan).data('feature');
		freshPlan(true);
		Competitorplan(true);
		plansName(fresh_largest,largest);
		$('.fd-plan, .cr-plan').css('display','block');
	});
}catch(ex){
	
}

})(jQuery);
(function () {

	// Dynamically resize div based on window size
	// if ($(window).width() >= 820) {
	// 	var resizeWindow = function(){
	// 		$('.home-banner-container')
	// 			.width($(this).width())
	// 			.height($(this).height());
	// 	}
	// 	resizeWindow();
	// 	$(window).on('resize', resizeWindow)
	// }

	// Display the Customer logos dyanamicallys
	var count=0;

    setInterval(function() {
	    $('.company-block.active,.tour-company-block.active').removeClass('active');
	   
	    if(count===6){count=0}
        count++
       
        $('#cb-'+count).addClass('active');
   		
   		var imgActive = $('.company-block.active .cb-img.active,.tour-company-block.active .cb-img.active').removeClass('active');
   		
   		if(imgActive.next() && imgActive.next().length){
                imgActive .next().addClass('active');
   		}
   		else{ imgActive.siblings(":first").addClass('active'); }
    }, 1000);
    

    setInterval(function() {
       	$('.flipster .flipto-next').trigger('click');
    }, 3000);

   

    //  Page scroll Animation


	  	$(window).on("scroll", function () {
		 	
		 	var y = $(this).scrollTop();	      
	        if (y > 410) {
				$('.home-features .fg-4').each(function(i) {
				    var $div = $(this);
				    setTimeout(function() { 
				    	$div.addClass('load'); 
				    }, i*300); // delay 300 ms
				});
			}
			 
			if (y > 200) {
				
				$("#bars li .bar,#bars li .bar1").each( function( key, bar ) {
				    var percentage = $(this).data('percentage');
				    
				    $(this).animate({ 'height' : percentage + '%' }, 2000)
				});

			    setTimeout(function(){
			    	$("#bars").addClass("risen");
			    	$("#bars li").first().addClass("active");

			    	$("#bars li").on("mouseenter", function(){
			    		$(this).parent().find(".active").removeClass("active");
			    		$(this).addClass("active");
			    	});
			    	$("#bars li").on("mouseleave", function(){
			    		$(this).removeClass("active");
			    	});
			    }, 2000);

				$('.tour-game.object').addClass('move-left');
				
				$('.tour-secondary-banner .pointer, .tour1-content').each(function(i) {
				    var $div = $(this);
				    setTimeout(function() { $div.addClass('active'); }, i*130); // delay 130 ms
				});
			}

			//  Header Sticky showen after the First Div

        	var topDiv = ($('#topDiv').offset() || { "top": NaN }).top;
        	var isStuck = false;
        	if(!isStuck)
        	{
        	    $('#fd-home.fd-home-sticky.in').removeClass("stuck");
        	    if( y > topDiv)
        	    {
        	          $("#fd-home.fd-home-sticky.in").addClass('stuck');
        	          $(".fresh-widgets").show();
        	          isStuck = true;
        	   }
        	}
        	else {
        		if( y < topDiv)
        	    {
        	       $('#fd-home.fd-home-sticky.in').removeClass("stuck");
        	       isStuck = false;
        	   	}
        	}
	        	
		});		


	var location = window.location.href;

	var slide_index = $('[rel="'+ location +'"]').index() - 1 ;

	var slide_pos = slide_index;
	var slide_len = 0;
	var slide_int;
	var restart;

 	
   
	// Tour Pagination

	$(document).pjax('a[data-pjax]', '#tour-append');
	$('#tour-append')
		.on('pjax:start', function (xhr, options) {
        debugger;
			slide_pos = $('[rel="'+ window.location.href +'"]').index() - 1;
			changeIt();
			$('#tour-append')
					.removeClass('fade-in')
					.addClass('fade-out');
			
			$('html, body').animate({
		        scrollTop: $('#slideshow').offset().top
		    }, 1000);
		}).
		on('pjax:send', function (xhr, options) {
			window['tourLoader'] =  setTimeout(function(){ 
										$('#loader')
											.addClass('tour-loader') 
											.fadeIn(500);
									}, 2000);
		}).
		on('pjax:complete', function (xhr, options) {
			clearTimeout(window['tourLoader']);	
		
			$('#loader')
				.fadeOut(500, function(){ 
					$(this).removeClass('tour-loader');
				});

			$('#tour-append')
					.removeClass('fade-out')
					.addClass('fade-in');

			$('.flipster').flipster({ style: 'carousel' });
			
			$(".topImage").css('width', '50%');
			
			$(".beforeAfterSlidebar").mousemove( function(e) {
				// get the mouse x (horizontal) position and offset of the div
				var offset =  $(this).offset();
				var iTopWidth = (e.pageX - offset.left);
				// set width of bottomimage div
				$(this).find(".topImage").width(iTopWidth);
			});

		}).
		on('pjax:popstate', function (ev) {
			slide_pos = $('[rel="'+ window.location.href +'"]').index() - 1;
		});
	
	 /*home slide show */

	$(document).ready(function() {
	    var $next = $('.next');
	    var $prev = $('.prev');

	    slide_pos = $('[rel="'+ window.location.href +'"]').index() - 1;
	    slide_len = $(".slideshow_item").size() - 1;

	    $(".slideshow_item:eq(" + slide_pos + ")").show();
	    $(".tour-features-strip li:eq(" + slide_pos + ")").addClass('active');

	    $next.click(function(){
	        if (slide_pos < slide_len){
	            clearInterval( slide_int );
	            slide_pos++;
	        }
	        else{
	        	clearInterval( slide_int );          
            	slide_pos = 0;
	        }
            changeIt();
	    })
	    
	    $prev.click(function(){
	        if (slide_pos > 0){
	            clearInterval( slide_int);
	            slide_pos--;
	        }
	        else{
	        	clearInterval( slide_int );           
            	if(slide_pos == 0){
            		slide_pos = $(".slideshow_item").size() - 1 ;
            	} else{
            		slide_pos--;
            	}
	        }
             changeIt();
	    })
	});

	function changeIt(){
	    $(".slideshow_item").fadeOut(500);
	    $(".slideshow_item:eq(" + slide_pos + ")").fadeIn(1000);

	    $(".tour-features-strip li.active").removeClass('active');
	    $(".tour-features-strip li:eq(" + slide_pos + ")").addClass('active');
	}


	$('.tour-features-strip a').on('click', function(ev){
		if($(this).parent().hasClass("active")){
			ev.preventDefault();
		}
	});


	
}());
(function($) {

$.fn.flipster = function(options) {
	
	var defaults = {
		itemContainer:			'ul', // Container for the flippin' items.
		itemSelector:				'li', // Selector for children of itemContainer to flip
		style:							'coverflow', // Switch between 'coverflow' or 'carousel' display styles
		start:							'center', // Starting item. Set to 0 to start at the first, 'center' to start in the middle or the index of the item you want to start with.
		
		enableKeyboard:			true, // Enable left/right arrow navigation
		enableMousewheel:		true, // Enable scrollwheel navigation (up = left, down = right)
		enableTouch:				true, // Enable swipe navigation for touch devices
		
		enableNav:					false, // If true, flipster will insert an unordered list of the slides
		enableNavButtons:		true, // If true, flipster will insert Previous / Next buttons
		
		onItemSwitch:				function(){

		}, // Callback function when items are switches
	};
	var settings = $.extend({}, defaults, options);
	var win = $(window);
	
	return this.each(function(){
		
		var _flipster = $(this);
		var	_flipItemsOuter;
		var	_flipItems;
		var	_flipNav;
		var	_flipNavItems;
		var	_current = 0;
		
		var _startTouchX = 0;
		var _actionThrottle = 0;
		var _throttleTimeout;
		var compatibility;
		
		function removeThrottle() {
			_actionThrottle = 0;
		}
			
		function resize() {
			_flipItemsOuter.css("height",_flipItems.height());
			_flipster.css("height","auto");
			if ( settings.style === 'carousel' ) { _flipItemsOuter.width(_flipItems.width()); }
		}
		
		function buildNav() {
			if ( settings.enableNav && _flipItems.length > 1 ) {
				var navCategories = [],
					navItems = [],
					navList = [];
				
				_flipItems.each(function(){
					var category = $(this).data("flip-category"),
						itemId = $(this).attr("id"),
						itemTitle = $(this).attr("title");
						
					if ( typeof category !== 'undefined' ) {
						if ( $.inArray(category,navCategories) < 0 ) {
							navCategories.push(category);
							navList[category] = '<li class="flip-nav-category"><a href="#" class="flip-nav-category-link" data-flip-category="'+category+'">'+category+'</a>\n<ul class="flip-nav-items">\n';
						}
					}
					
					if ( $.inArray(itemId,navItems) < 0 ) {
						navItems.push(itemId);
						link = '<a href="#'+itemId+'" class="flip-nav-item-link">'+itemTitle+'</a></li>\n';
						if ( typeof category !== 'undefined' ) {
							navList[category] = navList[category] + '<li class="flip-nav-item">' + link;
						} else {
							navList[itemId] = '<li class="flip-nav-item no-category">' + link;
						}
					}
				});
				
				navDisplay = '<ul class="flipster-nav">\n';
				for ( var catIndex in navCategories ) {
					navList[navCategories[catIndex]] = navList[navCategories[catIndex]] + "</ul>\n</li>\n";
				}
				for ( var navIndex in navList ) { navDisplay += navList[navIndex]; }
				navDisplay += '</ul>';
				
				_flipNav = $(navDisplay).prependTo(_flipster);
				_flipNavItems = _flipNav.find("a").on("click",function(e){
					var target;
					if ( $(this).hasClass("flip-nav-category-link") ) {
						target = _flipItems.filter("[data-flip-category='"+$(this).data("flip-category")+"']");
					} else {
						target = $(this.hash);
					}
					
					if ( target.length ) {
						jump(target);
						e.preventDefault();
					}
				});
			}
		}
		
		function updateNav() {
			if ( settings.enableNav && _flipItems.length > 1 ) {
				currentItem = $(_flipItems[_current]);
				_flipNav.find(".flip-nav-current").removeClass("flip-nav-current");
				_flipNavItems.filter("[href='#"+currentItem.attr("id")+"']").addClass("flip-nav-current");
				_flipNavItems.filter("[data-flip-category='"+currentItem.data("flip-category")+"']").parent().addClass("flip-nav-current");
			}
		}
		
		function buildNavButtons() {
			if ( settings.enableNavButtons && _flipItems.length > 1 ) {
				_flipster.find(".flipto-prev, .flipto-next").remove();
				_flipster.append("<a href='#' class='flipto-prev'></a> <a href='#' class='flipto-next'></a>");
				
				_flipster.children('.flipto-prev').on("click", function(e) {
					jump("left");
					e.preventDefault();
				});
				
				_flipster.children('.flipto-next').on("click", function(e) {
					jump("right");
					e.preventDefault();
				});
			}
		}
		
		function center() {
			var currentItem = $(_flipItems[_current]).addClass("flip-current");
			
			_flipItems.removeClass("flip-prev flip-next flip-current flip-past flip-future no-transition");
		
			if ( settings.style === 'carousel' ) {
				
				_flipItems.addClass("flip-hidden");
			
				var nextItem = $(_flipItems[_current+1]),
					futureItem = $(_flipItems[_current+2]),
					prevItem = $(_flipItems[_current-1]),
					pastItem = $(_flipItems[_current-2]);
				
				if ( _current === 0 ) {
					prevItem = _flipItems.last();
					pastItem = prevItem.prev();
				}
				else if ( _current === 1 ) {
					pastItem = _flipItems.last();
				}
				else if ( _current === _flipItems.length-2 ) {
					futureItem = _flipItems.first();
				}
				else if ( _current === _flipItems.length-1 ) {
					nextItem = _flipItems.first();
					futureItem = $(_flipItems[1]);
				}
					
				// futureItem.removeClass("flip-hidden").addClass("flip-future");
				// pastItem.removeClass("flip-hidden").addClass("flip-past");
				nextItem.removeClass("flip-hidden").addClass("flip-next");
				prevItem.removeClass("flip-hidden").addClass("flip-prev");
					
			} else {
				var spacer = currentItem.outerWidth()/2;
				var totalLeft = 0;
				var totalWidth = _flipItemsOuter.width();
				var currentWidth = currentItem.outerWidth();
				var currentLeft = (_flipItems.index(currentItem)*currentWidth)/2 +spacer/2;
				
				for (i = 0; i < _flipItems.length; i++) {
					var thisItem = $(_flipItems[i]);
					var thisWidth = thisItem.outerWidth();
					
					if (i < _current) {
						thisItem.addClass("flip-past")
							.css({
								"z-index" : i,
								"left" : (i*thisWidth/2)+"px"
							});
					}
					else if ( i > _current ) {
						thisItem.addClass("flip-future")
							.css({
								"z-index" : _flipItems.length-i,
								"left" : (i*thisWidth/2)+spacer+"px"
							});
					}
				}
				
				currentItem.css({
					"z-index" : _flipItems.length+1,
					"left" : currentLeft +"px"
				});
				
				totalLeft = (currentLeft + (currentWidth/2)) - (totalWidth/2);
				var newLeftPos = -1*(totalLeft)+"px";
/* Untested Compatibility */
				if (compatibility) {
					var leftItems = $(".flip-past");
					var rightItems = $(".flip-future");
					$(".flip-current").css("zoom", "1.0");
					for (i = 0; i < leftItems.length; i++) {
						$(leftItems[i]).css("zoom", (100-((leftItems.length-i)*5)+"%"));
					}
					for (i = 0; i < rightItems.length; i++) {
						$(rightItems[i]).css("zoom", (100-((i+1)*5)+"%"));
					}

					_flipItemsOuter.animate({"left":newLeftPos}, 333);
				}
				else {
					_flipItemsOuter.css("left", newLeftPos);
				}
			}
				
			currentItem
				.addClass("flip-current")
				.removeClass("flip-prev flip-next flip-past flip-future flip-hidden");
			
			resize();
			updateNav();
			settings.onItemSwitch.call(this);
		}
		
		function jump(to) {
			if ( _flipItems.length > 1 ) {
				if ( to === "left" ) {
					if ( _current > 0 ) { _current--; }
					else { _current = _flipItems.length-1; }
				}
				else if ( to === "right" ) {
					if ( _current < _flipItems.length-1 ) { _current++; }
					else { _current = 0; }
				} else if ( typeof to === 'number' ) {
					_current = to;
				} else {
					// if object is sent, get its index
					_current = _flipItems.index(to);
				}
				center();
			}
		}
	
		function init() {
/* Untested Compatibility */
				
			// Basic setup
			_flipster.addClass("flipster flipster-active flipster-"+settings.style).css("visiblity","hidden");
			_flipItemsOuter = _flipster.find(settings.itemContainer).addClass("flip-items");
			_flipItems = _flipItemsOuter.find(settings.itemSelector).addClass("flip-item flip-hidden").wrapInner("<div class='flip-content' />");
			
			//Browsers that don't support CSS3 transforms get compatibility:
			var isIEmax8 = ('\v' === 'v'); //IE <= 8
			var checkIE = document.createElement("b");
			checkIE.innerHTML = "<!--[if IE 9]><i></i><![endif]-->"; //IE 9
			var isIE9 = checkIE.getElementsByTagName("i").length === 1;
			if (isIEmax8 || isIE9) {
				compatibility = true;
				_flipItemsOuter.addClass("compatibility");
			}
			
	
			// Insert navigation if enabled.
			buildNav();
			buildNavButtons();
			
			
			// Set the starting item
			if ( settings.start && _flipItems.length > 1 ) {
				// Find the middle item if start = center
				if ( settings.start === 'center' ) {
					if (!_flipItems.length % 2) {
						_current = _flipItems.length/2 + 1;
					}
					else {
						_current = Math.floor(_flipItems.length/2);
					}
				} else {
					_current = settings.start;
				}
			}
			
			
			// initialize containers
			resize();
			
			
			// Necessary to start flipster invisible and then fadeIn so height/width can be set accurately after page load
			_flipster.hide().css("visiblity","visible").fadeIn(400,function(){ center(); });
			
			
			// Attach event bindings.
			win.resize(function(){ resize(); center(); });
			
			
			// Navigate directly to an item by clicking
			_flipItems.on("click", function(e) {
				if ( !$(this).hasClass("flip-current") ) { e.preventDefault(); }
				jump(_flipItems.index(this));
			});
			
			
			// Keyboard Navigation
			if ( settings.enableKeyboard && _flipItems.length > 1 ) {
				win.on("keydown.flipster", function(e) {
					_actionThrottle++;
					if (_actionThrottle % 7 !== 0 && _actionThrottle !== 1) return; //if holding the key down, ignore most events
					
					var code = e.which;
					if (code === 37 ) {
						e.preventDefault();
						jump('left');
					}
					else if (code === 39 ) {
						e.preventDefault();
						jump('right');
					}
				});
		
				win.on("keyup.flipster", function(e){
					_actionThrottle = 0; //reset action throttle on key lift to avoid throttling new interactions
				});
			}
			
			
			// // Mousewheel Navigation
			// if ( settings.enableMousewheel && _flipItems.length > 1 ) { // TODO: Fix scrollwheel on Firefox
			// 	_flipster.on("mousewheel.flipster", function(e){
			// 		_throttleTimeout = window.setTimeout(removeThrottle, 500); //throttling should expire if scrolling pauses for a moment.
			// 		_actionThrottle++;
			// 		if (_actionThrottle % 4 !==0 && _actionThrottle !== 1) return; //throttling like with held-down keys
			// 		window.clearTimeout(_throttleTimeout);
					
			// 		if ( e.originalEvent.wheelDelta /120 > 0 ) { jump("left"); }
			// 		else { jump("right"); }
					
			// 		e.preventDefault();
			// 	});
			// }
			
			
			// Touch Navigation
			if ( settings.enableTouch && _flipItems.length > 1 ) {
				_flipster.on("touchstart.flipster", function(e) {
					_startTouchX = e.originalEvent.targetTouches[0].screenX;
				});
		
				_flipster.on("touchmove.flipster", function(e) {
					e.preventDefault();
					var nowX = e.originalEvent.targetTouches[0].screenX;
					var touchDiff = nowX-_startTouchX;
					if (touchDiff > _flipItems[0].clientWidth/1.75){
						jump("left");
						_startTouchX = nowX;
					}else if (touchDiff < -1*(_flipItems[0].clientWidth/1.75)){
						jump("right");
						_startTouchX = nowX;
					}
				});
		
				_flipster.on("touchend.flipster", function(e) {
					_startTouchX = 0;
				});
			}
		}
		
		
		// Initialize if flipster is not already active.
		if ( !_flipster.hasClass("flipster-active") ) { init(); }
	});
};
})( jQuery );
$(document).ready(function(){
	// Dropdown
	function DropDown(el) {
		this.dd = el;
		this.placeholder = this.dd.children('span');
		this.opts = this.dd.find('ul.dropdown > li');
		this.val = '';
		this.index = -1;
		this.initEvents();
	}
	DropDown.prototype = {
		initEvents : function() {
			var obj = this;

			obj.dd.on('click', function(event){
				$(this).toggleClass('active');
				$('.wrapper-dropdown .caret').toggleClass('active');
				return false;
			});

			obj.opts.on('click',function(){
				var opt = $(this);
				obj.val = opt.children().clone();
				obj.index = opt.index();
				obj.placeholder.html(obj.val);
			});
		},
		getValue : function() {
			return this.val;
		},
		getIndex : function() {
			return this.index;
		}
	}
	var dd = new DropDown( $('#dd') );

	$(document).click(function() {
		// all dropdowns
		$('.wrapper-dropdown').removeClass('active');
		$(".wrapper-dropdown .caret").removeClass('active');
	});

	

	var expand = true;
if ($(window).width() >= 980){

	$('.res-search').on('click',function() {
		$('#dd').fadeOut(150);
		$('.icon-close').show('slow')
		if(expand == true){
			$(this).animate({ width: '+=330' }, {
				duration: 700,
					complete: function(){
						expand = false;
					}
			});
		}
	});
	
	$('.icon-close').click(function(e){
		e.stopPropagation();
		if(e.target.className !== "res-search"){
			$(this).hide('slow');
			$(".res-search").animate({ width: '-=330' }, 
				{
			     duration: 500,
			     complete: function(){
					$('#dd').fadeIn('slow');	
					$('.null-value').hide(); 
					widget(integrationName);	
					$(".search-text").val('');  
					expand = true;     
			    }
			});
		}
		
	});
}	

$(document).click(function(e){
	
	if($('.icon-close').is(':visible') ){

		if(e.target.className !== "search-text"){
			$('.icon-close').hide('slow');
			$(".res-search").animate({ width: '-=330' }, 
				{
			     duration: 500,
			     complete: function(){
					$('#dd').fadeIn('slow');	
					$('.null-value').hide(); 
					widget(integrationName);	
					$(".search-text").val('');  
					expand = true;     
			    }
			});
		}
	}
		
});


	var integrationName = '',
		TempArray;
	$('#dd li').on('click',function(e){
		$(".wrapper-dropdown .caret").hide();
		e.preventDefault();
		integrationName = $(this).children().data('category');
		widget(integrationName);		
	});


	function widget(integrationName){
		$('.res-widget').hide();
		if (integrationName != '') {
			var $obj = $('.res-widget');
			$obj.each(function(i,val){
				TempArray = $(val).data('title').split(',');
				if (TempArray.indexOf(integrationName) != -1) {
					$(val).show();
				};
			});
		}else{
			$('.res-widget').show();
		};
	}

	

	$('#search-keyword').on( "keyup", function() {
		$('.null-value').hide();
		if($(this).val()) {
			var input = $(this).val().toLowerCase();
			$(".res-widget").hide();
			$(".res-widget[data-head*='"+ input +"']").show();
			if(!$('.res-widget:visible').get(0)){
				$('.null-value').show();
			}
		}else{
			$('.null-value').hide();
			widget(integrationName);		
		}
	});
		  


});
/*!
 * jQuery Box roll slider
 * http://completebaltics.com/blog/jquery-roll-slider/
 * 
 * Copyright (c) 2014 Complete Baltics ltd. Kasparas Skripkauskas
 * Dual licensed under the MIT and GPL licenses.
 */

// Frok me on GitHub: https://github.com/CompleteBaltics/boxroll-slider
// 
// About: Examples
// 
// The working example
// Basic example     - http://completebaltics.com/www/boxroll-slider/
// 
// Usage example:
// Add the javascript file jquery.boxroll-slider.js or jquery.boxroll-slider.min.js to your html documents <HEAD>
// Add the css file jquery.boxroll-slider.css to your documents <HEAD>
// 
// Use this code with your own selector to initialize the plugin
// $('#slide-container').boxRollSlider({
//  items: '.items', - default is the containers children
//  timer: 7000, - interval to change slides default is 2000ms
// });
// 
// If height has changed you can also update the slider by calling this function
// $('#slide-container').boxRollSlider('update');
// 
// jQuery Versions - 1.8+
// 
// if css animations are not supported the plugin degrades to javascript crossfade
// 

(function ( $ ) {
    $.fn.boxRollSlider = function(options) {
      
      if(options === 'update' && $(this).hasClass('boxroll-slider')){
        update();
      }
      // set defaults
      var defaults = {
        container: $(this), // store the container
        items: $(this).children(), // store default slides
        timer: 2000, // set interval
      };
      
      // merge settings with the defaults
      $.extend(defaults, options);
      
      var items = defaults.container.find(defaults.items); // get the slides
      var height = Math.round(defaults.container.height()/2); // get the half height of container
      var transitionend = 'webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend'; // add strings for css animation events with browser prefixes
      var current = 0; // set current slide to zero
      var count = items.length-1; // get the total slides in container
      var int; // create a variable for the interval id
      
      // test if the browser supports css animation
      var thisBody = document.body || document.documentElement,
      thisStyle = thisBody.style,
      
      // if support is TRUE then css animations are supported
      support = thisStyle.transition !== undefined || thisStyle.WebkitTransition !== undefined || thisStyle.MozTransition !== undefined || thisStyle.MsTransition !== undefined || thisStyle.OTransition !== undefined;

      
      // add slider class to container
      defaults.container.addClass('boxroll-slider');
      // add slide class to slides, also set the proper css transorm
      items.addClass('boxroll-slider-item').css('transform','rotateX(-90deg) translate3d( 0px, ' + height + 'px, ' + height + 'px )');

      // add the proper css thansform to the first slide
      items.eq(current).css({'transform':'rotateX(0deg) translate3d( 0px, 0px, 0px )', 'opacity':1, 'z-index': 1, 'visibility':'visible'});
      
      // set the ticker
      int = window.setInterval(function(){
        brains();
      }, defaults.timer);

      // recalculate the css transform when the browser window is resized
      $(window).resize(function(){
        update();
      });
      
      $(document).ready(function(){
        // bind window focus and blur events to stop the ticker and reinitialize it when the tab loses and gains focus
        $(window).on("focus",function(){
          int = window.setInterval(function(){
            brains();
          }, defaults.timer);
        }).on("blur", function(){
          window.clearInterval(int);
        });
      });

      // the brains of the animation
      function brains(){
        // check if css aniamtion is suported
        if(support){
          // animate the active slide
          items.eq(current).css({'transform':'rotateX(90deg) translate3d( 0px, ' + (-height) + 'px, ' + height + 'px )', 'z-index': 0, 'opacity':0}).on(transitionend, function(){
            // hide it when not in view
            $(this).unbind(transitionend).css({'transform':'rotateX(-90deg) translate3d( 0px, ' + height + 'px, ' + height + 'px )', 'z-index': -1, 'opacity':1,'visibility':'hidden'});
          });
        }else{
          // if css animations are not supported start fade out
          items.eq(current).css({'z-index':0, 'visibility':'visible'});
        }
        // change the active slide variable
        if(current < count){
          current++;
        }else{
          current = 0;
        }
        // check if css aniamtion is suported
        if(support){
          // show the new active slide
          items.eq(current).css({'transform':'rotateX(0deg) translate3d( 0px, 0px, 0px )', 'visibility':'visible'}).on(transitionend, function(){
            $(this).unbind(transitionend).css({'z-index':1});
          });
        }else{
          // fade in the new slide
          items.eq(current).css({'z-index':1, 'visibility':'visible', 'opacity':0}).animate({'opacity':1},1000);
        }
      }
      
      // update css transform
      function update(){
        var it = defaults.container.find('.boxroll-slider-item');
        // reset the container height
        height = Math.round(it.height()/2);
        // iterate through slides and change css transform
        it.each(function(){
          // set a diffrent css transform to the slide before the current
          items.eq(current-1).css({'transform':'rotateX(90deg) translate3d( 0px, ' + (-height) + 'px, ' + height + 'px )'});
          // set a diffrent css transform to the current slide
          items.eq(current).css({'transform':'rotateX(0deg) translate3d( 0px, 0px, 0px )'});
          // set a diffrent css transform to all other slides
          items.not(':eq(' + current + '), :eq(' + (current-1) + ')').css({'transform':'rotateX(-90deg) translate3d( 0px, ' + height + 'px, ' + height + 'px )'});
        });
      }
      
      return $(this);
    };
}( jQuery ));
if ($(window).width() >= 1080){
	$(document).ready(function(){
		var $timeline_block = $('.fd-timeline-block');
		var animate = true;
		//hide timeline blocks which are outside the viewport
		$timeline_block.each(function(){
			if($(this).offset().top > $(window).scrollTop()+$(window).height()*0.95) {
				$(this).find('.fd-timeline-content').addClass('animate');
				$(this).find('.fd-img-timeline').addClass('hidden');
			}
		});

		//on scolling, show/animate timeline blocks when enter the viewport
		$(window).on('scroll', function(){
			$timeline_block.each(function(index){
				if( $(this).offset().top <= $(window).scrollTop()+$(window).height()*0.75) {
					 if (index%2 == 0) {
					 	$(this).find('.fd-timeline-content.animate').animate( { right: '250' },{
							duration: 500,
							complete: function(){
								$(this).parent().find('.fd-img-timeline.hidden').fadeIn('slow');
						    }
						});
					}else{
						$(this).find('.fd-timeline-content.animate').animate( { left: '250' },{
							duration: 500,
							complete: function(){
								$(this).parent().find('.fd-img-timeline.hidden').fadeIn('slow');
						    }
						});
					}
				}
			});
		});
	});
}
;
/*
 * Javascript for integrating Google Site Search and related behaviour.
 */

//global variable to store the results of suggestions
var suggestions = [];

//global variable for serving as a lock during search requests to Google.
var gssReady = true;

//global variable to check if user has stopped typing and provide suggestions
var gssSuggestLock = 0;

/* Code to add event listeners on document ready */
jQuery(document).ready(function () {

    /* Event listener for the search element toggler */
    jQuery('#gss_pane_toggle').change(function (e) {
        if (!document.getElementById("gss_pane_toggle").checked) { //when search is closed

            //reset margin offsets which were given for preventing scrollbar jumps
            jQuery("body").css({"overflow-y": "auto", "margin-right": "0"});
            jQuery(".top-nav-strip").css({"position": "static", "right": "0"});

            //fade out the dismiss button
            jQuery(".gss-hide-pane").css("opacity", "0");

            //time out of 200ms to wait for the animation to complete before loading the 
            //browser with JS operations
            window.setTimeout(function() {

                //hide the clear results ico
                jQuery(".icon-gss-clear").hide();

                //reset the search wrapper
                gssReset();

                //reset the search parameters
                jQuery("#gss_search_input").val("");

                //clear the input field completely
                onInputChange("");

                //reset results index
                jQuery("#gss_start_index").val(0);

                //display the landing div
                jQuery("#gss_landing").show();

                //reset suggestions
                suggestions.length = 0;
            }, 200);

        } else { //when search is opened

            //set margin offsets to prevent scroll bar jumps
            jQuery("body").css({"overflow-y": "hidden", "margin-right": "15px"});
            jQuery(".top-nav-strip").css({"position": "relative", "right": "7.5px"});

            //focus on the input
            jQuery("#gss_search_input").focus();

            //fade in the dismiss icon
            window.setTimeout(function() {
                jQuery(".gss-hide-pane").css("opacity", "1.0")
            }, 175);
        }
    });

    /* Event Listener for ESCAPE key */
    jQuery("html").on("keyup", function(e) {
        var key = (e.keyCode ? e.keyCode : e.which);
        if(document.getElementById('gss_pane_toggle').checked && key == 27) {
            jQuery('label[for="gss_pane_toggle"]:first').click();
        }
    });

    /* Event listener for clearing search results */
    jQuery("i.icon-gss-clear").click(function() {
        jQuery("#gss_search_input").val("");
        onInputChange("");
        jQuery("#gss_search_input").focus();
    });

    /* Event listener for triggering a search when the arrow icon is clicked */
    jQuery(".gss-search-bar i.icon-gss-enter").click(function() {
        onEnterKeyPress();
    });

    /* Event listener for back to top icon */
    jQuery(".gss-back-to-top").click(function(){
        jQuery("#gss_results").animate({scrollTop: 0},500);
    });

    /* Event listener for the scroll event - used to implement infinite scroll */
    jQuery("#gss_results").scroll(function () {
        if (jQuery("#gss_results > ul").children().length > 0) {
            var pane = document.querySelector("#gss_results");

            /* check if user has scrolled from the top of the list and trigger search bar sticky state */
            if (pane.scrollTop > 0) {
                jQuery("#gss_search_bar_sticky_toggle").prop("checked", true);
            } else {
                jQuery("#gss_search_bar_sticky_toggle").prop("checked", false);
            }

            /* 
             * if the user has scrolled to the bottom of the results list, load more results or display 
             * an appropriate message indicating the end of the results list
             */
            if (pane.scrollHeight - pane.scrollTop === pane.clientHeight) {
                onScrollToBottom(pane);
            }

            /* if the user scrolls beyond 10% of the results list height, show the back to top icon */
            if(pane.scrollTop >= (0.1 * pane.scrollHeight)) {
                jQuery(".gss-back-to-top").addClass('visible');
            } else {
                jQuery(".gss-back-to-top").removeClass('visible');
            }
        }
    });

    /* Event Listener for displaying hints and detecting enter key up, paste or change */
    jQuery("#gss_search_input").on("change keyup paste", function (e) {
        var key = (e.keyCode ? e.keyCode : e.which);
        var suggestion_field = jQuery("#gss_search_suggestion");
        switch(key) { 
            case 13: //enter key
                suggestion_field.addClass("hidden");
                onEnterKeyPress();
                break;
            default: //other codes (except arrows and tab)    
                suggestion_field.removeClass("hidden");
                if(key != 9 && (key < 37 || key > 40)) {
                    jQuery("#gss_search_suggestion").val("");
                    onInputChange((jQuery("#gss_search_input").val()).trim());

                    //desktop only feature
                    if(jQuery(".site-nav li.gss-menu-item").css("display") != "none") {
                        var current_time = (new Date()).getTime();
                        gssSuggestLock = current_time;
                        window.setTimeout(function() {
                            if(current_time == gssSuggestLock){
                                gssSuggestLock = 0;
                                gssSuggest();
                            }
                        }, 200);
                    }
                }    
                break;
        }
    });

    /* Add this listener only for desktop site */
    if(jQuery(".site-nav li.gss-menu-item").css("display") != "none") {
        /* 
         * Event listener for tab key and right arrow auto-completion
         * and up/down arrow suggestion navigation
         */
        jQuery("#gss_search_input").on("keydown", function(e) {
            var key = (e.keyCode ? e.keyCode : e.which);
            var suggestion_field = jQuery("#gss_search_suggestion");
            switch(key) {
                case 8: //backspace - same as delete, so no break statement.
                case 46: //delete key
                    suggestion_field.val("");
                    break;
                case 9: //tab key - same as right arrow, so no break statement.
                case 39: // right arrow
                    if(suggestion_field.val() != "") {
                        e.preventDefault();
                        jQuery("#gss_search_input").val(suggestion_field.val());
                        suggestion_field.val("");
                    }
                    break;
                case 38: //up arrow
                    e.preventDefault();
                    var index = suggestions.indexOf((suggestion_field.val()).toLowerCase());
                    if(typeof index != "undefined" && index > 0) {
                        suggestion_field.val(suggestions[index-1].replace(this.value.toLowerCase(), this.value));
                    }
                    break;
                case 40: //down arrow
                    e.preventDefault();
                    var index = suggestions.indexOf((suggestion_field.val()).toLowerCase());
                    if(typeof index != "undefined" && index < (suggestions.length - 1)) {
                        suggestion_field.val(suggestions[index+1].replace(this.value.toLowerCase(), this.value));
                    }
                    break;
            }
        });    
    }

    /* Event listener for detecting clicks on the result items and opening the links */
    jQuery("#gss_results > ul").on("click", "li.result-item", function(e) {
        if(e.target.tagName == "UL") {
            jQuery(e.target.querySelector("a"))[0].click();
        } else {
            if(jQuery(e.target).hasClass("result-title")) {
                jQuery(e.target.querySelector("a"))[0].click();
            } else if(jQuery(e.target).hasClass("result-snippet")) {
                jQuery(e.target.parentNode.querySelector("li > a"))[0].click();
            }
        }
    });

    //    /* Event listeners for changing border color when input element is focused */
    //    jQuery("#gss_search_input").on("focus", function() {
    //        jQuery(".gss-search-bar-wrapper").addClass("focused");
    //    });
    //    jQuery("#gss_search_input").on("blur", function() {
    //        jQuery(".gss-search-bar-wrapper").removeClass("focused");
    //    });
});

/* function for resetting the search element */
function gssReset() {
    jQuery("#gss_search_suggestion").val("");
    jQuery("#gss_search_bar_sticky_toggle").prop("checked", false);
    jQuery(".gss-back-to-top").removeClass('visible');
    jQuery("#gss_results > ul").empty();
    jQuery(".gss-no-results").remove();
    jQuery(".gss-footer").remove();
}

/* function to trigger the chain of events for a new search on enter key press */
function onEnterKeyPress() {
    document.getElementById("gss_results_status").checked = true;
    jQuery.when(jQuery(".gss-search-hints, .gss-search-bar .icon-gss-enter, #gss_landing").fadeOut(50)).done(function() {
        gssReset();
        gsSubmit(0, function() {
            window.setTimeout(function(){
                jQuery(".icon-gss-clear").fadeIn();
            }, 200);
        });
    });
}

/* function to handle changes in search input box */
function onInputChange(text) {
    switch (text.length) {
        case 0:
            jQuery('.icon-gss-clear').fadeOut('fast', function(){
                document.getElementById("gss_results_status").checked = false;
                gssReset();
                jQuery('.gss-search-hints, .gss-search-bar .icon-gss-enter').css("opacity", "0");
                jQuery('.gss-search-hints, .gss-search-bar .icon-gss-enter, #gss_landing').fadeIn('fast');
                jQuery("#gss_search_suggestion").val("");
            });
            break;
        case 1:
            jQuery('.gss-search-hints, .gss-search-bar .icon-gss-enter').css("opacity", "0.33");
            break;
        case 2:
            jQuery('.gss-search-hints, .gss-search-bar .icon-gss-enter').css("opacity", "0.66");
            break;
        default:
            jQuery('.gss-search-hints, .gss-search-bar .icon-gss-enter').css("opacity", "1");
    }
}

/* function to handle results scrolling */
function onScrollToBottom(pane) {
    var start_index = jQuery("#gss_start_index").val();
    if (parseInt(start_index, 10) > 0) {
        if(gssReady) {
            gssReady = false;
            gsSubmit(start_index);
        }
    } else if (parseInt(start_index, 10) == -1) {
        if (!jQuery(".gss-searchpane").find(".gss-footer").length) {
            var msg = "<div class=\"gss-footer\"><span>Uh-oh!</span><br/><br/>";
            msg += "<span>You seem to be having difficulties finding what you want. We’d let you search on";
            msg += " but there be zombies yonder. So why don’t you just try again with a different search term?";
            msg += "</span><br/><br/><span>If you’d like to get in touch with us, here’s our <a target=\"_blank\"";
            msg += " href=\"/contact\">Contact page</a> with all the info you need!</span>";
            msg += "</div>";
            jQuery("#gss_results").append(msg);
            jQuery(".gss-footer").slideDown('fast', function(){
                jQuery("#gss_results").animate({scrollTop: (pane.scrollHeight - pane.clientHeight)},500); 
            });
        }
    } else {
        if (!jQuery(".gss-searchpane").find(".gss-footer").length) {
            var msg = "<div class=\"gss-footer\"><span>The End of the Road</span><br/><br/>";
            msg += "<span>Your search term didn’t match any other document. If you haven’t found the right ";
            msg += "one yet, why don’t you try again with a different term?</span><br/>";
            msg += "<br/><span>If you’d like to get in touch with us, here’s our <a target=\"_blank\"";
            msg += " href=\"/contact\">Contact page</a> with all the info you need!</span>";
            msg += "</div>";
            jQuery("#gss_results").append(msg);
            jQuery(".gss-footer").slideDown('fast', function(){
                jQuery("#gss_results").animate({scrollTop: (pane.scrollHeight - pane.clientHeight)},500); 
            });
        }
    }
}

/* function to provide search term suggestions */
function gssSuggest() {
    var text = jQuery("#gss_search_input").val();
    if(text.length >= 3) {
        //Auto-suggest feature
        var suggest_query = "http://clients1.google.com/complete/search?";
        suggest_query += "&client=partner&sugexp=gsnos%2Cn%3D13&gs_rn=25&gs_ri=partner";
        suggest_query += "&partnerid=010818749140373723172%3Avop1-soxtg4";
        suggest_query += "&types=t&ds=cse&cp=2&q=";//
        suggest_query += (jQuery("#gss_search_input").val()).toLowerCase();
        jQuery.ajax({
            url: suggest_query,
            method: "GET",
            dataType: "jsonp",
            jsonp: "callback",
            success: function(result) {
                var input_field = jQuery("#gss_search_input");
                result[1].forEach(function(input, index){
                    result[1][index] = input[0];
                });
                suggestions = result[1];
                if(result[1][0] && result[1][0] != input_field.val() 
                   && input_field.val().length > 0) {
                    //&& !document.getElementById("gss_results_status").checked) {
                    jQuery("#gss_search_suggestion").val(suggestions[0].replace(text.toLowerCase(),text));
                }
            }
        });
    }
}

/* Search query processor */
function gsSubmit(startIndex, callback) {
    jQuery(".gss-loading").fadeIn('fast');

    //JSON API
    //URL for Google Site Search's JSON API 
    var search_query = "https://www.googleapis.com/customsearch/v1?";

    //Parameter 1 - API Key (this is the unique key for accessing the Freshdesk Google Site Search through the JSON API)
    var APIKey = "AIzaSyCMGfdDaSfjqv5zYoS0mTJnOT3e9MURWkU";

    //Parameter 2 - Engine ID (this is ID of the custom search engine created for Freshdesk. The custom engine is linked to
    //the freshdesk marketing team's account (ramesh@freshdesk.com). This ID and the above key can be found in that account.
    //Search engine tuning and setup can also be done in that account.
    var engineID = "010818749140373723172:vop1-soxtg4";

    //Parameter 3 - actual search terms entered by a user.
    var search_input = encodeURIComponent(document.getElementById("gss_search_input").value);

    search_query += ("key=" + APIKey + "&cx=" + engineID + "&q=" + search_input);

    //Parameter 4 (optional) - start index of the results. Default is 1. Google returns up to 10 results for a search query.
    //These 10 results are the first page of results. For all subsequent pages, the start index needs to be specified.
    //For example, page 2 starts at index 11 and goes up to index 20. Page 3 starts at index 21 and so on.
    if (parseInt(startIndex, 10) > 0) {
        search_query += "&start=" + startIndex;
    }

    //AJAX call to the search engine.
    jQuery.ajax({
        url: search_query,
        method: 'GET',
        complete: function (result) {
            console.log(result);
            var response = JSON.parse(result.responseText);
            console.log(response);
            if(response.items && response.items.length > 0) {
                displayResults(response);
                gssReady = true;
            } else {
                gssReady = true;
                var msg = "<div class=\"gss-footer\"><span>Sorry!</span><br/><br/><span>We couldn’t find what ";
                msg += " you were looking for.  Why don’t you try again with a different keyword?</span><br/><br/>";
                msg += "<span>If you’d like to get in touch with us, here’s our <a target=\"_blank\" href=\"/contact\">";
                msg += "Contact page</a> with all the info you need!</span></div>";
                jQuery("#gss_results").append(msg);
                jQuery(".gss-loading").fadeOut(function(){
                    jQuery(".gss-footer").slideDown('fast');
                });
            }
            if(callback) {                
                callback();
            }
            ga('send','pageview', 'freshdesk.com/?q='+search_input);
        }
    });
}

/* function to display the results */
function displayResults(results) {
    document.querySelector('#gss_results > ul').innerHTML += renderHtmlResults(results);
    jQuery(".gss-loading").fadeOut(function(){

        //set information about the next page, if available.
        if (results.queries.nextPage) {

            //if start index for next page is not zero, set the start index.
            if (parseInt(results.queries.nextPage[0].startIndex, 10) != 0) {
                jQuery("#gss_start_index").val(results.queries.nextPage[0].startIndex);
            }

            //if the start index is > 100, set a value of -1 to break the infinite scroll
            //and inform the user that they might need to adjust their search terms.
            if (parseInt(results.queries.nextPage[0].startIndex, 10) > 100) {
                jQuery("#gss_start_index").val("-1");
            }
        } else {
            //if Google returns no information about a next page, the set a value of -2
            //to break the infinite scroll and inform the user that they need to adjust
            //the search terms
            jQuery("#gss_start_index").val("-2");
        } 
    });
}

/* function to render the html results */
function renderHtmlResults(results) {
    var regex_linebreak = new RegExp("\\u003cbr\\u003e\\n", "g"); //regex to remove line breaks inserted by Google
    var regex_bold = new RegExp("\\u003c\/?(b\\u003e)", "g"); //regex to remove bold tags inserted by Google
    var output = "";
    for (var i = 0; i < results.items.length; i++) {
        output += '<li class="result-item">';
        output += '<ul style="list-style: none; text-align: left;">';
        output += '<li class="result-title"><a target="_blank" href="';
        output += results.items[i].link.search(/https|http/g) >= 0 ? '' : 'http://';
        output += results.items[i].link;
        output += '">';
        output += results.items[i].htmlTitle.replace(regex_bold, "") + '</a></li>';
        if (results.items[i].formattedUrl.search(/support.freshdesk.com/g) >= 0) {
            output += '<li class="result-tag"><div class="gss-solution-article">Solution Article</div></li>';
        }
        output += '<li class="result-snippet">';
        output += (results.items[i].htmlSnippet.replace(regex_linebreak, "")).replace(regex_bold, "") + "</li>";
        output += '</ul>';
        output += '</li>';
    }
    return output;
}
;
/*
 * @author venom
 * Freshdesk website specific ui-elements initialization scripts
 */




























;
})(jQuery);