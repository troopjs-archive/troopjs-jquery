/*!
 * TroopJS jQuery weave plug-in
 * @license TroopJS Copyright 2012, Mikael Karon <mikael@karon.se>
 * Released under the MIT license.
 */
/*jshint strict:false, smarttabs:true, laxbreak:true, loopfunc:true */
/*global define:true */
define([ "jquery", "troopjs-utils/getargs", "require", "./destroy" ], function WeaveModule($, getargs, parentRequire) {
	var UNDEFINED;
	var FUNCTION = Function;
	var ARRAY_PROTO = Array.prototype;
	var ARRAY_PUSH = ARRAY_PROTO.push;
	var ARRAY_SLICE = ARRAY_PROTO.slice;
	var ARRAY_POP = ARRAY_PROTO.pop;
	var $WHEN = $.when;
	var THEN = "then";
	var WIDGETS = "widgets";
	var WEAVE = "weave";
	var UNWEAVE = "unweave";
	var WOVEN = "woven";
	var DESTROY = "destroy";
	var LENGTH = "length";
	var DATA = "data-";
	var DATA_WEAVE = DATA + WEAVE;
	var DATA_WOVEN = DATA + WOVEN;
	var DATA_UNWEAVE = DATA + UNWEAVE;
	var SELECTOR_WEAVE = "[" + DATA_WEAVE + "]";
	var SELECTOR_UNWEAVE = "[" + DATA_WOVEN + "]";
	var RE_SEPARATOR = /[\s,]+/;

	/**
	 * Generic destroy handler.
	 * Simply makes sure that unweave has been called
	 */
	function onDestroy() {
		$(this).unweave();
	}

	$.fn[WEAVE] = function weave() {
		var $elements = $(this);
		var weave_args = arguments;
		var woven = [];
		var wovenLength = 0;

		// Get or create deferred
		var deferred = weave_args[LENGTH] > 0 && weave_args[weave_args[LENGTH] - 1][THEN] instanceof FUNCTION
			? ARRAY_POP.call(weave_args)
			: $.Deferred();

		// Prepare $elements for weaving
		$elements
			// Reduce to only elements that can be woven
			.filter(SELECTOR_WEAVE)
				// Reduce to only elements that don't have a the destroy handler attached
				.filter(function () {
					// Get events
					var events = $._data(this, "events");

					// Check if we can find the onDestroy event handler in events
					var found = events && $.grep(events[DESTROY] || false, function (handleObj) {
						return handleObj.handler === onDestroy;
					}).length > 0;

					// Return true if not found, false if we did
					return !found;
				})
				// Attach onDestroy event
				.on(DESTROY, onDestroy)
				// Back to previous filtering
				.end()
			// Iterate
			.each(function elementIterator(index, element) {
				var $element = $(element);
				var $data = $element.data();
				var $widgets = $data[WIDGETS] || ($data[WIDGETS] = []);
				var $widgetsLength = $widgets[LENGTH];
				var $woven = [];
				var $wovenLength = 0;
				var matches;
				var attr_weave = $element.attr(DATA_WEAVE);
				var attr_args;
				var i;
				var iMax;
				var value;
				var re = /[\s,]*([\w_\-\/\.]+)(?:\(([^\)]+)\))?/g;

				// Make sure to remove DATA_WEAVE (so we don't try processing this again)
				$element.removeAttr(DATA_WEAVE);

				// Iterate attr_weave (while re matches)
				// matches[0] : original matching string - " widget/name(1, 'string', false)"
				// matches[2] : widget name - "widget/name"
				// matches[3] : widget arguments - "1, 'string', false"
				while ((matches = re.exec(attr_weave)) !== null) {
					// Create attr_args
					attr_args = [ $element, matches[1] ];

					// Store trimmed matches[0] as WEAVE on attr_args
					attr_args[WEAVE] = $.trim(matches[0]);

					// Transfer arguments from getargs (if any exist)
					if (matches[2]) {
						ARRAY_PUSH.apply(attr_args, getargs.call(matches[2]));
					}

					// Iterate end of attr_args to copy from $data
					for (i = 2, iMax = attr_args[LENGTH]; i < iMax; i++) {
						// Get value
						value = attr_args[i];

						// Override if value is in $data
						attr_args[i] = value in $data
							? $data[value]
							: value;
					}

					// Store $woven arguments
					$woven[$wovenLength++] = attr_args;
				}

				// Iterate $woven
				$.each($woven, function ($wovenIndex, widget_args) {
					// Create deferredWeave
					var deferredWeave = $.Deferred();

					// Extract promise
					var promise = $widgets[$widgetsLength++] = $woven[$wovenIndex] = deferredWeave.promise();

					// Copy WEAVE
					promise[WEAVE] = widget_args[WEAVE];

					// Require module, add error handler
					parentRequire([ widget_args[1] ], function (Widget) {
						var widget;

						// Create deferredStart
						var deferredStart = $.Deferred();

						// Link deferredWeave and deferredStart
						deferredStart.then(function started() {
							deferredWeave.resolve(widget);
						}, deferredWeave.reject, deferredWeave.notify);

						try {
							// Create widget instance
							widget = Widget.apply(Widget, widget_args);

							// Add WOVEN to promise
							promise[WOVEN] = widget.toString();

							// Start
							widget.start(deferredStart);
						}
						catch (e) {
							// Reject deferredStart
							deferredStart.reject(e);
						}
					}, deferredWeave.reject);
				});

				// Add promise to woven)
				woven[wovenLength++] = $WHEN.apply($, $woven).then(function () {
					var widgets = ARRAY_SLICE.call(arguments);

					// Add widgets to $data[WOVEN]
					ARRAY_PUSH.apply($data[WOVEN] || ($data[WOVEN] = []), widgets);

					// Get current DATA_WOVEN attribute
					var attr_woven = $element.attr(DATA_WOVEN);

					// Convert to array
					attr_woven = attr_woven === UNDEFINED
						? []
						: [ attr_woven ];

					// Push orinal weave
					ARRAY_PUSH.apply(attr_woven, $.map(widgets, function (widget) { return widget.toString(); }));

					// Either set or remove DATA_WOVEN attribute
					if (attr_woven[LENGTH] !== 0) {
						$element.attr(DATA_WOVEN, attr_woven.join(" "));
					}
					else {
						$element.removeAttr(DATA_WOVEN);
					}

					// Trigger event on $element indicating widget(s) were woven
					$element.triggerHandler(WEAVE, widgets);
				}).promise();
			});

		// Link promise of all woven
		$WHEN.apply($, woven).then(deferred.resolve, deferred.reject, deferred.notify);

		// Return $elements
		return $elements;
	};

	$.fn[UNWEAVE] = function unweave() {
		var $elements = $(this);
		var unweave_args = arguments;
		var unwoven = [];
		var unwovenLength = 0;

		// If deferred not a true Deferred, make it so
		var deferred = unweave_args[LENGTH] > 0 && unweave_args[unweave_args[LENGTH] - 1][THEN] instanceof FUNCTION
			? ARRAY_POP.call(unweave_args)
			: $.Deferred();

		$elements
			// Reduce to only elements that can be unwoven
			.filter(SELECTOR_UNWEAVE)
			// Iterate
			.each(function elementIterator(index, element) {
				var $element = $(element);
				var $data = $element.data();
				var $widget;
				var $widgets = $data[WIDGETS] || ($data[WIDGETS] = []);
                		var $woven = $data[WOVEN] || ($data[WOVEN] = []);
				var $unwoven = [];
				var $unwovenLength = 0;
				var attr_unweave = $element.attr(DATA_UNWEAVE);
				var i;
				var j;
				var iMax;
				var re;

				// Remove DATA_UNWEAVE attribute
				$element.removeAttr(DATA_UNWEAVE);

				// If we have attr_unweave, we need to filter
				if (attr_unweave) {
					// Create regexp to match widgets
					re = RegExp($.map(attr_unweave.split(RE_SEPARATOR), function (widget) {
						return "^" + widget;
					}).join("|"), "m");

					for (i = j = 0, iMax = $widgets[LENGTH]; i < iMax; i++) {
						$widget = $widgets[i];

						if (re.test($widget[WOVEN])) {
							$unwoven[$unwovenLength++] = $widget;
							continue;
						}

						$widgets[j++] = $widget;
					}

					$widgets[LENGTH] = $woven[LENGTH] = j;

					// When all $widgets are fulfilled
					$WHEN.apply($, $widgets).then(function () {
						var widgets = ARRAY_SLICE.call(arguments);

						// Either set or remove DATA_WOVEN argument
						if (widgets[LENGTH] !== 0) {
							$element.attr(DATA_WOVEN, widgets.join(" "));
						}
						else {
							$element.removeAttr(DATA_WOVEN);
						}
					});
				}
				else {
					// Copy from $widgets to $unwoven
					for (i = 0, iMax = $widgets[LENGTH]; i < iMax; i++) {
						$unwoven[$unwovenLength++] = $widgets[i];
					}

					// Truncate $widgets and $data[WOVEN]
					$widgets[LENGTH] = $woven[LENGTH] = 0;

					// Remove DATA_WOVEN attribute
					$element.removeAttr(DATA_WOVEN);
				}

				// Iterate $unwoven
				$.each($unwoven, function ($unwovenIndex, $widget) {
					// Create deferredUnweave
					var deferredUnweave = $.Deferred();

					// Extract promise
					var promise = $unwoven[$unwovenIndex] = deferredUnweave.promise();

					// Copy WEAVE
					promise[WEAVE] = $widget[WEAVE];

					// Wait for $widget to complete
					$widget.then(function (widget) {
						// Create deferredStop
						var deferredStop = $.Deferred();

						// Link deferredUnweave and deferredStop
						deferredStop.then(function stopped() {
							deferredUnweave.resolve(widget);
						}, deferredUnweave.reject, deferredUnweave.notify);

						try {
							// Stop
							widget.stop(deferredStop);
						}
						catch (e) {
							// Reject deferredStart
							deferredStop.reject(e);
						}
					});

					// Add to unwoven
					unwoven[unwovenLength++] = $WHEN.apply($, $unwoven).then(function () {
						var widgets = ARRAY_SLICE.call(arguments);

						// Get current DATA_WEAVE attribute
						var attr_weave = $element.attr(DATA_WEAVE);

						// Convert to array
						attr_weave = attr_weave === UNDEFINED
							? []
							: [ attr_weave ];

						// Push orinal weave
						ARRAY_PUSH.apply(attr_weave, $.map($unwoven, function ($widget) { return $widget[WEAVE]; }));

						// Either set or remove DATA_WEAVE attribute
						if (attr_weave[LENGTH] !== 0) {
							$element.attr(DATA_WEAVE, attr_weave.join(" "));
						}
						else {
							$element.removeAttr(DATA_WEAVE);
						}

						// Trigger event on $element indicating widget(s) were unwoven
						$element.triggerHandler(UNWEAVE, widgets);
					}).promise();
				});
			});

		// Link promise of all woven
		$WHEN.apply($, unwoven).then(deferred.resolve, deferred.reject, deferred.notify);

		return $elements;
	};

	$.fn[WOVEN] = function woven(/* arg, arg */) {
		var result = [];
		var widgets = arguments.length > 0
			? RegExp($.map(arguments, function (widget) {
			return "^" + widget + "$";
		}).join("|"), "m")
			: UNDEFINED;

		$(this).each(function elementIterator(index, element) {
			if (!$.hasData(element)) {
				return;
			}

			ARRAY_PUSH.apply(result, widgets === UNDEFINED
				? $.data(element, WOVEN)
				: $.map($.data(element, WOVEN) || false, function (woven) {
				return widgets.test(woven.displayName)
					? woven
					: UNDEFINED;
			}));
		});

		return result;
	};
});
