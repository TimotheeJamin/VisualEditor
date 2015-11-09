/*!
 * VisualEditor ContentEditable Surface class.
 *
 * @copyright 2011-2015 VisualEditor Team and others; see http://ve.mit-license.org
 */

/**
 * ContentEditable surface.
 *
 * @class
 * @extends OO.ui.Element
 * @mixins OO.EventEmitter
 *
 * @constructor
 * @param {ve.dm.Surface} model Surface model to observe
 * @param {ve.ui.Surface} ui Surface user interface
 * @param {Object} [config] Configuration options
 */
ve.ce.Surface = function VeCeSurface( model, ui, config ) {
	var surface = this;

	// Parent constructor
	OO.ui.Element.call( this, config );

	// Mixin constructors
	OO.EventEmitter.call( this );

	// Properties
	this.surface = ui;
	this.model = model;
	this.documentView = new ve.ce.Document( model.getDocument(), this );
	this.surfaceObserver = new ve.ce.SurfaceObserver( this );
	this.$window = $( this.getElementWindow() );
	this.$document = $( this.getElementDocument() );
	this.$documentNode = this.getDocument().getDocumentNode().$element;
	// Window.getSelection returns a live singleton representing the document's selection
	this.nativeSelection = this.getElementWindow().getSelection();
	this.eventSequencer = new ve.EventSequencer( [
		'keydown', 'keypress', 'keyup',
		'compositionstart', 'compositionend',
		'input'
	] );
	this.clipboard = [];
	this.clipboardId = String( Math.random() );
	this.renderLocks = 0;
	this.dragging = false;
	this.relocatingNode = false;
	this.allowedFile = null;
	this.resizing = false;
	this.focused = false;
	this.deactivated = false;
	this.$deactivatedSelection = $( '<div>' );
	this.activeTableNode = null;
	this.contentBranchNodeChanged = false;
	this.selectionLink = null;
	this.$highlightsFocused = $( '<div>' );
	this.$highlightsBlurred = $( '<div>' );
	this.$highlights = $( '<div>' ).append(
		this.$highlightsFocused, this.$highlightsBlurred
	);
	this.$findResults = $( '<div>' );
	this.$dropMarker = $( '<div>' ).addClass( 've-ce-surface-dropMarker oo-ui-element-hidden' );
	this.$lastDropTarget = null;
	this.lastDropPosition = null;
	this.$pasteTarget = $( '<div>' );
	this.pasting = false;
	this.copying = false;
	this.pasteSpecial = false;
	this.focusedBlockSlug = null;
	this.focusedNode = null;
	// This is set on entering changeModel, then unset when leaving.
	// It is used to test whether a reflected change event is emitted.
	this.newModelSelection = null;

	// Snapshot updated at keyDown. See storeKeyDownState.
	this.keyDownState = {
		event: null,
		selection: null
	};

	this.cursorDirectionality = null;
	this.unicorningNode = null;
	this.setUnicorningRecursionGuard = false;
	this.cursorHolders = null;

	this.hasSelectionChangeEvents = 'onselectionchange' in this.getElementDocument();

	// Events
	this.model.connect( this, {
		select: 'onModelSelect',
		documentUpdate: 'onModelDocumentUpdate',
		insertionAnnotationsChange: 'onInsertionAnnotationsChange'
	} );

	this.onDocumentMouseUpHandler = this.onDocumentMouseUp.bind( this );
	this.$documentNode.on( {
		// mouse events shouldn't be sequenced as the event sequencer
		// is detached on blur
		mousedown: this.onDocumentMouseDown.bind( this ),
		// mouseup is bound to the whole document on mousedown
		cut: this.onCut.bind( this ),
		copy: this.onCopy.bind( this )
	} );

	this.onWindowResizeHandler = this.onWindowResize.bind( this );
	this.$window.on( 'resize', this.onWindowResizeHandler );

	this.onDocumentFocusInOutHandler = this.onDocumentFocusInOut.bind( this );
	this.$document.on( 'focusin focusout', this.onDocumentFocusInOutHandler );
	// It is possible for a mousedown to clear the selection
	// without triggering a focus change event (e.g. if the
	// document has been programmatically blurred) so trigger
	// a focus change to check if we still have a selection
	this.debounceFocusChange = ve.debounce( this.onFocusChange ).bind( this );
	this.$document.on( 'mousedown', this.debounceFocusChange );

	this.$pasteTarget.add( this.$highlights ).on( {
		cut: this.onCut.bind( this ),
		copy: this.onCopy.bind( this ),
		paste: this.onPaste.bind( this )
	} );

	this.$documentNode
		// Bug 65714: MSIE possibly needs `beforepaste` to also be bound; to test.
		.on( 'paste', this.onPaste.bind( this ) )
		.on( 'focus', 'a', function () {
			// Opera <= 12 triggers 'blur' on document node before any link is
			// focused and we don't want that
			surface.$documentNode[ 0 ].focus();
		} );

	if ( this.hasSelectionChangeEvents ) {
		this.$document.on( 'selectionchange', this.onDocumentSelectionChange.bind( this ) );
	} else {
		this.$documentNode.on( 'mousemove', this.onDocumentSelectionChange.bind( this ) );
	}

	this.$element.on( {
		dragstart: this.onDocumentDragStart.bind( this ),
		dragover: this.onDocumentDragOver.bind( this ),
		dragleave: this.onDocumentDragLeave.bind( this ),
		drop: this.onDocumentDrop.bind( this )
	} );

	// Add listeners to the eventSequencer. They won't get called until
	// eventSequencer.attach(node) has been called.
	this.eventSequencer.on( {
		keydown: this.onDocumentKeyDown.bind( this ),
		keyup: this.onDocumentKeyUp.bind( this ),
		keypress: this.onDocumentKeyPress.bind( this ),
		input: this.onDocumentInput.bind( this )
	} ).after( {
		keydown: this.afterDocumentKeyDown.bind( this )
	} );

	// Initialization
	// Add 'notranslate' class to prevent Chrome's translate feature from
	// completely messing up the CE DOM (T59124)
	this.$element.addClass( 've-ce-surface notranslate' );
	this.$highlights.addClass( 've-ce-surface-highlights' );
	this.$highlightsFocused.addClass( 've-ce-surface-highlights-focused' );
	this.$highlightsBlurred.addClass( 've-ce-surface-highlights-blurred' );
	this.$deactivatedSelection.addClass( 've-ce-surface-deactivatedSelection' );
	this.$pasteTarget
		.addClass( 've-ce-surface-paste' )
		.prop( {
			tabIndex: -1,
			contentEditable: 'true'
		} );

	// Add elements to the DOM
	this.$highlights.append( this.$dropMarker );
	this.$element.append( this.$documentNode, this.$pasteTarget );
	this.surface.$blockers.append( this.$highlights );
	this.surface.$selections.append( this.$deactivatedSelection );
};

/* Inheritance */

OO.inheritClass( ve.ce.Surface, OO.ui.Element );

OO.mixinClass( ve.ce.Surface, OO.EventEmitter );

/* Events */

/**
 * @event relocationStart
 */

/**
 * @event relocationEnd
 */

/**
 * @event keyup
 */

/**
 * When the surface changes its position (only if it happens
 * after initialize has already been called).
 *
 * @event position
 */

/**
 * @event focus
 * Note that it's possible for a focus event to occur immediately after a blur event, if the focus
 * moves to or from a FocusableNode. In this case the surface doesn't lose focus conceptually, but
 * a pair of blur-focus events is emitted anyway.
 */

/**
 * @event blur
 * Note that it's possible for a focus event to occur immediately after a blur event, if the focus
 * moves to or from a FocusableNode. In this case the surface doesn't lose focus conceptually, but
 * a pair of blur-focus events is emitted anyway.
 */

/* Static properties */

/**
 * Attributes considered 'unsafe' for copy/paste
 *
 * These attributes may be dropped by the browser during copy/paste, so
 * any element containing these attributes will have them JSON encoded into
 * data-ve-attributes on copy.
 *
 * @type {string[]}
 */
ve.ce.Surface.static.unsafeAttributes = [
	// RDFa: Firefox ignores these
	'about',
	'content',
	'datatype',
	'property',
	'rel',
	'resource',
	'rev',
	'typeof',
	// CSS: Values are often added or modified
	'style'
];

/**
 * Cursor holder template
 *
 * @static
 * @property {HTMLElement}
 */
ve.ce.Surface.static.cursorHolderTemplate = (
	$( '<div>' )
		.addClass( 've-ce-cursorHolder' )
		.prop( 'contentEditable', 'true' )
		.append(
			// The image does not need a src for Firefox in spite of cursoring
			// bug https://bugzilla.mozilla.org/show_bug.cgi?id=989012 , because
			// you can cursor to ce=false blocks in Firefox (see bug
			// https://bugzilla.mozilla.org/show_bug.cgi?id=1155031 )
			$( '<img>' ).addClass( 've-ce-cursorHolder-img' )
		)
		.get( 0 )
);

/* Static methods */

/**
 * When pasting, browsers normalize HTML to varying degrees.
 * This hash creates a comparable string for validating clipboard contents.
 *
 * @param {jQuery} $elements Clipboard HTML
 * @param {Object} [beforePasteData] Paste information, including leftText and rightText to strip
 * @return {string} Hash
 */
ve.ce.Surface.static.getClipboardHash = function ( $elements, beforePasteData ) {
	beforePasteData = beforePasteData || {};
	return $elements.text().slice(
		beforePasteData.leftText ? beforePasteData.leftText.length : 0,
		beforePasteData.rightText ? -beforePasteData.rightText.length : undefined
	)
	// Whitespace may be modified (e.g. ' ' to '&nbsp;'), so strip it all
	.replace( /\s/gm, '' );
};

/* Methods */

/**
 * Destroy the surface, removing all DOM elements.
 *
 * @method
 */
ve.ce.Surface.prototype.destroy = function () {
	var documentNode = this.documentView.getDocumentNode();

	// Detach observer and event sequencer
	this.surfaceObserver.stopTimerLoop();
	this.surfaceObserver.detach();
	this.eventSequencer.detach();

	// Make document node not live
	documentNode.setLive( false );

	// Disconnect events
	this.model.disconnect( this );

	// Disconnect DOM events on the document
	this.$document.off( 'focusin focusout', this.onDocumentFocusInOutHandler );
	this.$document.off( 'mousedown', this.debounceFocusChange );

	// Disconnect DOM events on the window
	this.$window.off( 'resize', this.onWindowResizeHandler );

	// HACK: Blur to make selection/cursor disappear (needed in Firefox
	// in some cases, and in iOS to hide the keyboard)
	if ( this.isFocused() ) {
		this.blur();
	}

	// Remove DOM elements (also disconnects their events)
	this.$element.remove();
	this.$highlights.remove();
};

/**
 * Get linear model offset from absolute coords
 *
 * @param {number} x X offset
 * @param {number} y Y offset
 * @return {number} Linear model offset, or -1 if coordinates are out of bounds
 */
ve.ce.Surface.prototype.getOffsetFromCoords = function ( x, y ) {
	var offset, caretPosition, range, textRange, $marker,
		doc = this.getElementDocument();

	try {
		if ( doc.caretPositionFromPoint ) {
			// Gecko
			// http://dev.w3.org/csswg/cssom-view/#extensions-to-the-document-interface
			caretPosition = document.caretPositionFromPoint( x, y );
			offset = ve.ce.getOffset( caretPosition.offsetNode, caretPosition.offset );
		} else if ( doc.caretRangeFromPoint ) {
			// Webkit
			// http://www.w3.org/TR/2009/WD-cssom-view-20090804/
			range = document.caretRangeFromPoint( x, y );
			offset = ve.ce.getOffset( range.startContainer, range.startOffset );
		} else if ( document.body.createTextRange ) {
			// Trident
			// http://msdn.microsoft.com/en-gb/library/ie/ms536632(v=vs.85).aspx
			textRange = document.body.createTextRange();
			textRange.moveToPoint( x, y );
			textRange.pasteHTML( '<span class="ve-ce-textRange-drop-marker">&nbsp;</span>' );
			$marker = $( '.ve-ce-textRange-drop-marker' );
			offset = ve.ce.getOffset( $marker.get( 0 ), 0 );
			$marker.remove();
		}
		return offset;
	} catch ( e ) {
		// Both ve.ce.getOffset and TextRange.moveToPoint can throw out of bounds exceptions
		return -1;
	}
};

/**
 * Get a client rect from the range's end node
 *
 * This function is used internally by getSelectionRects and
 * getSelectionBoundingRect as a fallback when Range.getClientRects
 * fails. The width is hard-coded to 0 as the function is used to
 * locate the selection focus position.
 *
 * @private
 * @param {ve.Range} range Range to get client rect for
 * @return {Object|null} ClientRect-like object
 */
ve.ce.Surface.prototype.getNodeClientRectFromRange = function ( range ) {
	var rect, side, x, adjacentNode, unicornRect,
		node = range.endContainer;

	while ( node && node.nodeType !== Node.ELEMENT_NODE ) {
		node = node.parentNode;
	}

	if ( !node ) {
		return null;
	}

	// When possible, pretend the cursor is the left/right border of the node
	// (depending on directionality) as a fallback.

	// We would use getBoundingClientRect(), but in iOS7 that's relative to the
	// document rather than to the viewport
	rect = node.getClientRects()[ 0 ];
	if ( !rect ) {
		// FF can return null when focusNode is invisible
		return null;
	}

	side = this.getModel().getDocument().getDir() === 'rtl' ? 'right' : 'left';
	adjacentNode = range.endContainer.childNodes[ range.endOffset ];
	if ( range.collapsed && $( adjacentNode ).hasClass( 've-ce-unicorn' ) ) {
		// We're next to a unicorn; use its left/right position
		unicornRect = adjacentNode.getClientRects()[ 0 ];
		if ( !unicornRect ) {
			return null;
		}
		x = unicornRect[ side ];
	} else {
		x = rect[ side ];
	}

	return {
		top: rect.top,
		bottom: rect.bottom,
		left: x,
		right: x,
		width: 0,
		height: rect.height
	};
};

/**
 * Get the rectangles of the selection relative to the surface.
 *
 * @method
 * @param {ve.dm.Selection} [selection] Optional selection to get the rectangles for, defaults to current selection
 * @return {Object[]|null} Selection rectangles
 */
ve.ce.Surface.prototype.getSelectionRects = function ( selection ) {
	var i, l, range, nativeRange, surfaceRect, focusedNode, rect,
		rects = [],
		relativeRects = [];

	selection = selection || this.getModel().getSelection();
	if ( selection instanceof ve.dm.NullSelection ) {
		return null;
	} else if ( selection instanceof ve.dm.TableSelection ) {
		return this.getSelectionBoundingRect( selection );
	}

	range = selection.getRange();
	focusedNode = this.getFocusedNode( range );

	if ( focusedNode ) {
		return focusedNode.getRects();
	}

	nativeRange = this.getNativeRange( range );
	if ( !nativeRange ) {
		return null;
	}

	// Calling getClientRects sometimes fails:
	// * in Firefox on page load when the address bar is still focused
	// * in empty paragraphs
	try {
		rects = RangeFix.getClientRects( nativeRange );
		if ( !rects.length ) {
			throw new Error( 'getClientRects returned empty list' );
		}
	} catch ( e ) {
		rect = this.getNodeClientRectFromRange( nativeRange );
		if ( rect ) {
			rects = [ rect ];
		}
	}

	surfaceRect = this.getSurface().getBoundingClientRect();
	if ( !rects || !surfaceRect ) {
		return null;
	}

	for ( i = 0, l = rects.length; i < l; i++ ) {
		relativeRects.push( ve.translateRect( rects[ i ], -surfaceRect.left, -surfaceRect.top ) );
	}
	return relativeRects;
};

/**
 * Get the start and end rectangles of the selection relative to the surface.
 *
 * @method
 * @param {ve.dm.Selection} [selection] Optional selection to get the rectangles for, defaults to current selection
 * @return {Object|null} Start and end selection rectangles
 */
ve.ce.Surface.prototype.getSelectionStartAndEndRects = function ( selection ) {
	var range, focusedNode;

	selection = selection || this.getModel().getSelection();
	if ( selection instanceof ve.dm.NullSelection ) {
		return null;
	}

	range = selection.getRange();
	focusedNode = this.getFocusedNode( range );

	if ( focusedNode ) {
		return focusedNode.getStartAndEndRects();
	}

	return ve.getStartAndEndRects( this.getSelectionRects() );
};

/**
 * Get the coordinates of the selection's bounding rectangle relative to the surface.
 *
 * Returned coordinates are relative to the surface.
 *
 * @method
 * @param {ve.dm.Selection} [selection] Optional selection to get the rectangles for, defaults to current selection
 * @return {Object|null} Selection rectangle, with keys top, bottom, left, right, width, height
 */
ve.ce.Surface.prototype.getSelectionBoundingRect = function ( selection ) {
	var range, nativeRange, boundingRect, surfaceRect, focusedNode;

	selection = selection || this.getModel().getSelection();

	if ( selection instanceof ve.dm.TableSelection ) {
		boundingRect = this.getActiveTableNode().getSelectionBoundingRect( selection );
	} else if ( selection instanceof ve.dm.LinearSelection ) {
		range = selection.getRange();
		focusedNode = this.getFocusedNode( range );

		if ( focusedNode ) {
			return focusedNode.getBoundingRect();
		}

		nativeRange = this.getNativeRange( range );
		if ( !nativeRange ) {
			return null;
		}

		try {
			boundingRect = RangeFix.getBoundingClientRect( nativeRange );
			if ( !boundingRect ) {
				throw new Error( 'getBoundingClientRect returned null' );
			}
		} catch ( e ) {
			boundingRect = this.getNodeClientRectFromRange( nativeRange );
		}
	} else {
		return null;
	}

	surfaceRect = this.getSurface().getBoundingClientRect();
	if ( !boundingRect || !surfaceRect ) {
		return null;
	}
	return ve.translateRect( boundingRect, -surfaceRect.left, -surfaceRect.top );
};

/*! Initialization */

/**
 * Initialize surface.
 *
 * This should be called after the surface has been attached to the DOM.
 *
 * @method
 */
ve.ce.Surface.prototype.initialize = function () {
	this.documentView.getDocumentNode().setLive( true );
	if ( $.client.profile().layout === 'gecko' ) {
		// Turn off native object editing. This must be tried after the surface has been added to DOM.
		// This is only needed in Gecko. In other engines, these properties are off by default,
		// and turning them off again is expensive; see https://phabricator.wikimedia.org/T89928
		try {
			this.$document[ 0 ].execCommand( 'enableObjectResizing', false, false );
			this.$document[ 0 ].execCommand( 'enableInlineTableEditing', false, false );
		} catch ( e ) { /* Silently ignore */ }
	}
};

/**
 * Enable editing.
 *
 * @method
 */
ve.ce.Surface.prototype.enable = function () {
	this.documentView.getDocumentNode().enable();
};

/**
 * Disable editing.
 *
 * @method
 */
ve.ce.Surface.prototype.disable = function () {
	this.documentView.getDocumentNode().disable();
};

/**
 * Give focus to the surface, reapplying the model selection, or selecting the first content offset
 * if the model selection is null.
 *
 * This is used when switching between surfaces, e.g. when closing a dialog window. Calling this
 * function will also reapply the selection, even if the surface is already focused.
 */
ve.ce.Surface.prototype.focus = function () {
	var node,
		surface = this,
		selection = this.getModel().getSelection();

	if ( selection instanceof ve.dm.NullSelection ) {
		this.getModel().selectFirstContentOffset();
		selection = this.getModel().getSelection();
	}

	// Focus the documentNode for text selections, or the pasteTarget for focusedNode selections
	if ( this.focusedNode || selection instanceof ve.dm.TableSelection ) {
		this.$pasteTarget[ 0 ].focus();
	} else if ( selection instanceof ve.dm.LinearSelection ) {
		node = this.getDocument().getNodeAndOffset( selection.getRange().start ).node;
		$( node ).closest( '[contenteditable=true]' )[ 0 ].focus();
	}

	// If we are calling focus after replacing a node the selection may be gone
	// but onDocumentFocus won't fire so restore the selection here too.
	this.onModelSelect();
	setTimeout( function () {
		// In some browsers (e.g. Chrome) giving the document node focus doesn't
		// necessarily give you a selection (e.g. if the first child is a <figure>)
		// so if the surface isn't 'focused' (has no selection) give it a selection
		// manually
		// TODO: rename isFocused and other methods to something which reflects
		// the fact they actually mean "has a native selection"
		if ( !surface.isFocused() ) {
			surface.getModel().selectFirstContentOffset();
		}
	} );
	// onDocumentFocus takes care of the rest
};

/**
 * Blur the surface
 */
ve.ce.Surface.prototype.blur = function () {
	if ( this.deactivated ) {
		// Clear the model selection, so activate doesn't trigger another de-activate
		this.getModel().setNullSelection();
		this.activate();
	}
	this.nativeSelection.removeAllRanges();
	this.getElementDocument().activeElement.blur();
	// This won't trigger focusin/focusout events, so trigger focus change manually
	this.onFocusChange();
};

/**
 * Handler for focusin and focusout events. Filters events and debounces to #onFocusChange.
 *
 * @param {jQuery.Event} e focusin/out event
 */
ve.ce.Surface.prototype.onDocumentFocusInOut = function ( e ) {
	// Filter out focusin/out events on iframes
	// IE11 emits these when the focus moves into/out of an iframed document,
	// but these events are misleading because the focus in this document didn't
	// actually move.
	if ( e.target.nodeName.toLowerCase() === 'iframe' ) {
		return;
	}
	this.debounceFocusChange();
};

/**
 * Handle global focus change.
 */
ve.ce.Surface.prototype.onFocusChange = function () {
	var hasFocus = false;

	hasFocus = OO.ui.contains(
		[
			this.$documentNode[ 0 ],
			this.$pasteTarget[ 0 ],
			this.$highlights[ 0 ]
		],
		this.nativeSelection.anchorNode,
		true
	);

	if ( this.deactivated ) {
		if ( OO.ui.contains( this.$documentNode[ 0 ], this.nativeSelection.anchorNode, true ) ) {
			this.onDocumentFocus();
		}
	} else {
		if ( hasFocus && !this.isFocused() ) {
			this.onDocumentFocus();
		}
		if ( !hasFocus && this.isFocused() ) {
			this.onDocumentBlur();
		}
	}
};

/**
 * Deactivate the surface, stopping the surface observer and replacing the native
 * range with a fake rendered one.
 *
 * Used by dialogs so they can take focus without losing the original document selection.
 */
ve.ce.Surface.prototype.deactivate = function () {
	if ( !this.deactivated ) {
		// Disable the surface observer, there can be no observeable changes
		// until the surface is activated
		this.surfaceObserver.disable();
		this.deactivated = true;
		// Remove ranges so the user can't accidentally type into the document
		this.nativeSelection.removeAllRanges();
		this.updateDeactivatedSelection();
	}
};

/**
 * Reactivate the surface and restore the native selection
 */
ve.ce.Surface.prototype.activate = function () {
	if ( this.deactivated ) {
		this.deactivated = false;
		this.updateDeactivatedSelection();
		this.surfaceObserver.enable();
		if ( OO.ui.contains( this.$documentNode[ 0 ], this.nativeSelection.anchorNode, true ) ) {
			// The selection has been placed back in the document, either by the user clicking
			// or by the closing window updating the model. Poll in case it was the user clicking.
			this.surfaceObserver.clear();
			this.surfaceObserver.pollOnce();
		} else {
			// Clear focused node so onModelSelect re-selects it if necessary
			this.focusedNode = null;
			this.onModelSelect();
		}
	}
};

/**
 * Update the fake selection while the surface is deactivated.
 *
 * While the surface is deactivated, all calls to showModelSelection will get redirected here.
 */
ve.ce.Surface.prototype.updateDeactivatedSelection = function () {
	var i, l, rects,
		selection = this.getModel().getSelection();

	this.$deactivatedSelection.empty();

	if (
		!this.deactivated || this.focusedNode ||
		!( selection instanceof ve.dm.LinearSelection ) ||
		selection.isCollapsed()
	) {
		return;
	}
	rects = this.getSelectionRects( selection );
	if ( rects ) {
		for ( i = 0, l = rects.length; i < l; i++ ) {
			this.$deactivatedSelection.append( $( '<div>' ).css( {
				top: rects[ i ].top,
				left: rects[ i ].left,
				width: rects[ i ].width,
				height: rects[ i ].height
			} ) );
		}
	}
};

/**
 * Handle document focus events.
 *
 * This is triggered by a global focusin/focusout event noticing a selection on the document.
 *
 * @method
 * @fires focus
 */
ve.ce.Surface.prototype.onDocumentFocus = function () {
	if ( this.getModel().getSelection().isNull() ) {
		// If the document is being focused by a non-mouse/non-touch user event,
		// find the first content offset and place the cursor there.
		this.getModel().selectFirstContentOffset();
	}
	this.eventSequencer.attach( this.$element );
	this.surfaceObserver.startTimerLoop();
	this.focused = true;
	this.activate();
	this.$element.addClass( 've-ce-surface-focused' );
	this.emit( 'focus' );
};

/**
 * Handle document blur events.
 *
 * This is triggered by a global focusin/focusout event noticing no selection on the document.
 *
 * @method
 * @fires blur
 */
ve.ce.Surface.prototype.onDocumentBlur = function () {
	this.eventSequencer.detach();
	this.surfaceObserver.stopTimerLoop();
	this.surfaceObserver.pollOnce();
	this.surfaceObserver.clear();
	this.dragging = false;
	this.focused = false;
	if ( this.focusedNode ) {
		this.focusedNode.setFocused( false );
		this.focusedNode = null;
	}
	this.getModel().setNullSelection();
	this.$element.removeClass( 've-ce-surface-focused' );
	this.emit( 'blur' );
};

/**
 * Check if surface is focused.
 *
 * @return {boolean} Surface is focused
 */
ve.ce.Surface.prototype.isFocused = function () {
	return this.focused;
};

/**
 * Handle document mouse down events.
 *
 * @method
 * @param {jQuery.Event} e Mouse down event
 */
ve.ce.Surface.prototype.onDocumentMouseDown = function ( e ) {
	var newFragment;
	if ( e.which !== 1 ) {
		return;
	}

	// Remember the mouse is down
	this.dragging = true;

	// Bind mouseup to the whole document in case of dragging out of the surface
	this.$document.on( 'mouseup', this.onDocumentMouseUpHandler );

	this.surfaceObserver.stopTimerLoop();
	// In some browsers the selection doesn't change until after the event
	// so poll in the 'after' function
	setTimeout( this.afterDocumentMouseDown.bind( this, e, this.getModel().getSelection() ) );

	// Handle triple click
	// HACK: do not do triple click handling in IE, because their click counting is broken
	if ( e.originalEvent.detail >= 3 && !ve.init.platform.constructor.static.isInternetExplorer() ) {
		// Browser default behaviour for triple click won't behave as we want
		e.preventDefault();

		newFragment = this.getModel().getFragment()
			// After double-clicking in an inline slug, we'll get a selection like
			// <p><span><img />|</span></p><p>|Foo</p>. This selection spans a CBN boundary,
			// so we can't expand to the nearest CBN. To handle this case and other possible
			// cases where the selection spans a CBN boundary, collapse the selection before
			// expanding it. If the selection is entirely within the same CBN as it should be,
			// this won't change the result.
			.collapseToStart()
			// Cover the CBN we're in
			.expandLinearSelection( 'closest', ve.dm.ContentBranchNode )
			// ...but that covered the entire CBN, we only want the contents
			.adjustLinearSelection( 1, -1 );
		// If something weird happened (e.g. no CBN found), newFragment will be null.
		// Don't select it in that case, because that'll blur the surface.
		if ( !newFragment.isNull() ) {
			newFragment.select();
		}
	}
};

/**
 * Deferred until after document mouse down
 *
 * @param {jQuery.Event} e Mouse down event
 * @param {ve.dm.Selection} selectionBefore Selection before the mouse event
 */
ve.ce.Surface.prototype.afterDocumentMouseDown = function ( e, selectionBefore ) {
	// TODO: guard with incRenderLock?
	this.surfaceObserver.pollOnce();
	if ( e.shiftKey ) {
		this.fixShiftClickSelect( selectionBefore );
	}
};

/**
 * Handle document mouse up events.
 *
 * @method
 * @param {jQuery.Event} e Mouse up event
 */
ve.ce.Surface.prototype.onDocumentMouseUp = function ( e ) {
	this.$document.off( 'mouseup', this.onDocumentMouseUpHandler );
	this.surfaceObserver.startTimerLoop();
	// In some browsers the selection doesn't change until after the event
	// so poll in the 'after' function
	setTimeout( this.afterDocumentMouseUp.bind( this, e, this.getModel().getSelection() ) );
};

/**
 * Deferred until after document mouse up
 *
 * @param {jQuery.Event} e Mouse up event
 * @param {ve.dm.Selection} selectionBefore Selection before the mouse event
 */
ve.ce.Surface.prototype.afterDocumentMouseUp = function ( e, selectionBefore ) {
	// TODO: guard with incRenderLock?
	this.surfaceObserver.pollOnce();
	if ( e.shiftKey ) {
		this.fixShiftClickSelect( selectionBefore );
	}
	this.dragging = false;
};

/**
 * Fix shift-click selection
 *
 * When shift-clicking on links Chrome tries to collapse the selection
 * so check for this and fix manually.
 *
 * This can occur on mousedown or, if the existing selection covers the
 * link, on mouseup.
 *
 * https://code.google.com/p/chromium/issues/detail?id=345745
 *
 * @param {ve.dm.Selection} selectionBefore Selection before the mouse event
 */
ve.ce.Surface.prototype.fixShiftClickSelect = function ( selectionBefore ) {
	var newSelection;
	if ( !( selectionBefore instanceof ve.dm.LinearSelection ) ) {
		return;
	}
	newSelection = this.getModel().getSelection();
	if ( newSelection.isCollapsed() && !newSelection.equals( selectionBefore ) ) {
		this.getModel().setLinearSelection( new ve.Range( selectionBefore.getRange().from, newSelection.getRange().to ) );
	}
};

/**
 * Handle document selection change events.
 *
 * @method
 * @param {jQuery.Event} e Selection change event
 */
ve.ce.Surface.prototype.onDocumentSelectionChange = function () {
	if ( !this.dragging ) {
		// Optimisation
		return;
	}
	this.fixupCursorPosition( 0, this.dragging );
	this.updateActiveLink();
	this.surfaceObserver.pollOnceSelection();
};

/**
 * Handle document drag start events.
 *
 * @method
 * @param {jQuery.Event} e Drag start event
 */
ve.ce.Surface.prototype.onDocumentDragStart = function ( e ) {
	var dataTransfer = e.originalEvent.dataTransfer;
	try {
		dataTransfer.setData( 'application-x/VisualEditor', JSON.stringify( this.getModel().getSelection() ) );
	} catch ( err ) {
		// IE doesn't support custom data types, but overwriting the actual drag data should be avoided
		// TODO: Do this with an internal state to avoid overwriting drag data even in IE
		dataTransfer.setData( 'text', '__ve__' + JSON.stringify( this.getModel().getSelection() ) );
	}
};

/**
 * Handle document drag over events.
 *
 * @method
 * @param {jQuery.Event} e Drag over event
 */
ve.ce.Surface.prototype.onDocumentDragOver = function ( e ) {
	var i, l, $target, $dropTarget, node, dropPosition, targetPosition, top, left,
		nodeType, inIgnoreChildren, item, fakeItem,
		isContent = true,
		dataTransfer = e.originalEvent.dataTransfer;

	if ( this.relocatingNode ) {
		isContent = this.relocatingNode.isContent();
		nodeType = this.relocatingNode.getType();
	} else {
		if ( this.allowedFile === null ) {
			this.allowedFile = false;
			// If we can get file metadata, check if there is a DataTransferHandler registered
			// to handle it.
			if ( dataTransfer.items ) {
				for ( i = 0, l = dataTransfer.items.length; i < l; i++ ) {
					item = dataTransfer.items[ i ];
					if ( item.kind !== 'string' ) {
						fakeItem = new ve.ui.DataTransferItem( item.kind, item.type );
						if ( ve.init.target.dataTransferHandlerFactory.getHandlerNameForItem( fakeItem ) ) {
							this.allowedFile = true;
							break;
						}
					}
				}
			} else if ( dataTransfer.files ) {
				for ( i = 0, l = dataTransfer.files.length; i < l; i++ ) {
					item = dataTransfer.items[ i ];
					fakeItem = new ve.ui.DataTransferItem( item.kind, item.type );
					if ( ve.init.target.dataTransferHandlerFactory.getHandlerNameForItem( fakeItem ) ) {
						this.allowedFile = true;
						break;
					}
				}
			// If we have no metadata (e.g. in Firefox) assume it is droppable
			} else if ( Array.prototype.indexOf.call( dataTransfer.types || [], 'Files' ) !== -1 ) {
				this.allowedFile = true;
			}
		}
		// this.allowedFile is cached until the next dragleave event
		if ( this.allowedFile ) {
			isContent = false;
			nodeType = 'alienBlock';
		}
	}

	if ( !isContent ) {
		e.preventDefault();
		$target = $( e.target ).closest( '.ve-ce-branchNode, .ve-ce-leafNode' );
		if ( $target.length ) {
			// Find the nearest node which will accept this node type
			node = $target.data( 'view' );
			while ( node.parent && !node.parent.isAllowedChildNodeType( nodeType ) ) {
				node = node.parent;
			}
			if ( node.parent ) {
				inIgnoreChildren = false;
				node.parent.traverseUpstream( function ( n ) {
					if ( n.shouldIgnoreChildren() ) {
						inIgnoreChildren = true;
						return false;
					}
				} );
			}
			if ( node.parent && !inIgnoreChildren ) {
				$dropTarget = node.$element;
				dropPosition = e.originalEvent.pageY - $dropTarget.offset().top > $dropTarget.outerHeight() / 2 ? 'bottom' : 'top';
			} else {
				$dropTarget = this.$lastDropTarget;
				dropPosition = this.lastDropPosition;
			}
		}
		if ( this.$lastDropTarget && (
			!this.$lastDropTarget.is( $dropTarget ) || dropPosition !== this.lastDropPosition
		) ) {
			this.$dropMarker.addClass( 'oo-ui-element-hidden' );
			$dropTarget = null;
		}
		if ( $dropTarget && (
			!$dropTarget.is( this.$lastDropTarget ) || dropPosition !== this.lastDropPosition
		) ) {
			targetPosition = $dropTarget.position();
			// Go beyond margins as they can overlap
			top = targetPosition.top + parseFloat( $dropTarget.css( 'margin-top' ) );
			left = targetPosition.left + parseFloat( $dropTarget.css( 'margin-left' ) );
			if ( dropPosition === 'bottom' ) {
				top += $dropTarget.outerHeight();
			}
			this.$dropMarker
				.css( {
					top: top,
					left: left
				} )
				.width( $dropTarget.outerWidth() )
				.removeClass( 'oo-ui-element-hidden' );
		}
		if ( $dropTarget !== undefined ) {
			this.$lastDropTarget = $dropTarget;
			this.lastDropPosition = dropPosition;
		}
	}
};

/**
 * Handle document drag leave events.
 *
 * @method
 * @param {jQuery.Event} e Drag leave event
 */
ve.ce.Surface.prototype.onDocumentDragLeave = function () {
	this.allowedFile = null;
	if ( this.$lastDropTarget ) {
		this.$dropMarker.addClass( 'oo-ui-element-hidden' );
		this.$lastDropTarget = null;
		this.lastDropPosition = null;
	}
};

/**
 * Handle document drop events.
 *
 * Limits native drag and drop behaviour.
 *
 * @method
 * @param {jQuery.Event} e Drop event
 */
ve.ce.Surface.prototype.onDocumentDrop = function ( e ) {
	// Properties may be nullified by other events, so cache before setTimeout
	var selectionJSON, dragSelection, dragRange, originFragment, originData,
		targetRange, targetOffset, targetFragment,
		surfaceModel = this.getModel(),
		dataTransfer = e.originalEvent.dataTransfer,
		$dropTarget = this.$lastDropTarget,
		dropPosition = this.lastDropPosition;

	// Prevent native drop event from modifying view
	e.preventDefault();

	// Determine drop position
	if ( $dropTarget ) {
		// Block level drag and drop: use the lastDropTarget to get the targetOffset
		if ( $dropTarget ) {
			targetRange = $dropTarget.data( 'view' ).getModel().getOuterRange();
			if ( dropPosition === 'top' ) {
				targetOffset = targetRange.start;
			} else {
				targetOffset = targetRange.end;
			}
		} else {
			return;
		}
	} else {
		targetOffset = this.getOffsetFromCoords(
			e.originalEvent.pageX - this.$document.scrollLeft(),
			e.originalEvent.pageY - this.$document.scrollTop()
		);
		if ( targetOffset === -1 ) {
			return;
		}
	}
	targetFragment = surfaceModel.getLinearFragment( new ve.Range( targetOffset ) );

	// Get source range from drag data
	try {
		selectionJSON = dataTransfer.getData( 'application-x/VisualEditor' );
	} catch ( err ) {
		selectionJSON = dataTransfer.getData( 'text' );
		if ( selectionJSON.slice( 0, 6 ) === '__ve__' ) {
			selectionJSON = selectionJSON.slice( 6 );
		} else {
			selectionJSON = null;
		}
	}
	if ( this.relocatingNode ) {
		dragRange = this.relocatingNode.getModel().getOuterRange();
	} else if ( selectionJSON ) {
		dragSelection = ve.dm.Selection.static.newFromJSON( surfaceModel.getDocument(), selectionJSON );
		if ( dragSelection instanceof ve.dm.LinearSelection ) {
			dragRange = dragSelection.getRange();
		}
	}

	// Internal drop
	if ( dragRange ) {
		// Get a fragment and data of the node being dragged
		originFragment = surfaceModel.getLinearFragment( dragRange );
		originData = originFragment.getData();

		// Start staging so we can abort in the catch later
		surfaceModel.pushStaging();

		// Remove node from old location
		originFragment.removeContent();

		try {
			// Re-insert data at new location
			targetFragment.insertContent( originData );
			surfaceModel.applyStaging();
		} catch ( error ) {
			// Insert content may throw an exception if it can't find a way
			// to fixup the insertion sensibly
			surfaceModel.popStaging();
		}

	} else {
		// External drop
		this.handleDataTransfer( dataTransfer, false, targetFragment );
	}
	this.endRelocation();
};

/**
 * Handle document key down events.
 *
 * @method
 * @param {jQuery.Event} e Key down event
 */
ve.ce.Surface.prototype.onDocumentKeyDown = function ( e ) {
	var trigger, executed,
		selection = this.getModel().getSelection(),
		updateFromModel = false;

	if ( selection instanceof ve.dm.NullSelection ) {
		return;
	}

	if ( e.which === 229 ) {
		// Ignore fake IME events (emitted in IE and Chromium)
		return;
	}

	this.surfaceObserver.stopTimerLoop();
	this.incRenderLock();
	try {
		// TODO: is this correct?
		this.surfaceObserver.pollOnce();
	} finally {
		this.decRenderLock();
	}

	this.storeKeyDownState( e );

	if ( ve.ce.keyDownHandlerFactory.executeHandlersForKey( e.keyCode, selection.getName(), this, e ) ) {
		updateFromModel = true;
	} else {
		trigger = new ve.ui.Trigger( e );
		if ( trigger.isComplete() ) {
			executed = this.surface.execute( trigger );
			if ( executed || this.isBlockedTrigger( trigger ) ) {
				e.preventDefault();
				e.stopPropagation();
				updateFromModel = true;
			}
		}
	}

	if ( !updateFromModel ) {
		this.incRenderLock();
	}
	try {
		this.surfaceObserver.pollOnce();
	} finally {
		if ( !updateFromModel ) {
			this.decRenderLock();
		}
	}
	this.surfaceObserver.startTimerLoop();
};

/**
 * Check if a trigger event is blocked from performing its default behaviour
 *
 * If any of these triggers can't execute on the surface, (e.g. the underline
 * command has been blacklisted), we should still preventDefault so ContentEditable
 * native commands don't occur, leving the view out of sync with the model.
 *
 * @method
 * @param {ve.ui.Trigger} trigger Trigger to check
 * @return {boolean} Trigger should preventDefault
 */
ve.ce.Surface.prototype.isBlockedTrigger = function ( trigger ) {
	var platformKey = ve.getSystemPlatform() === 'mac' ? 'mac' : 'pc',
		blocked = {
			mac: [ 'cmd+b', 'cmd+i', 'cmd+u', 'cmd+z', 'cmd+y', 'cmd+shift+z' ],
			pc: [ 'ctrl+b', 'ctrl+i', 'ctrl+u', 'ctrl+z', 'ctrl+y', 'ctrl+shift+z' ]
		};

	return blocked[ platformKey ].indexOf( trigger.toString() ) !== -1;
};

/**
 * Handle document key press events.
 *
 * @method
 * @param {jQuery.Event} e Key press event
 */
ve.ce.Surface.prototype.onDocumentKeyPress = function ( e ) {
	// Filter out non-character keys. Doing this prevents:
	// * Unexpected content deletion when selection is not collapsed and the user presses, for
	//   example, the Home key (Firefox fires 'keypress' for it)
	// TODO: Should be covered with Selenium tests.
	if (
		// Catches most keys that don't produce output (charCode === 0, thus no character)
		e.which === 0 || e.charCode === 0 ||
		// Opera 12 doesn't always adhere to that convention
		e.keyCode === OO.ui.Keys.TAB || e.keyCode === OO.ui.Keys.ESCAPE ||
		// Ignore all keypresses with Ctrl / Cmd modifier keys
		ve.ce.isShortcutKey( e )
	) {
		return;
	}

	this.handleInsertion();
};

/**
 * Deferred until after document key down event
 *
 * @param {jQuery.Event} e keydown event
 */
ve.ce.Surface.prototype.afterDocumentKeyDown = function ( e ) {
	var direction, focusableNode, startOffset, endOffset, offsetDiff, dmFocus, dmSelection,
		inNonSlug, ceSelection, ceNode, range, fixupCursorForUnicorn, matrix, $focusNode,
		surface = this,
		isArrow = (
			e.keyCode === OO.ui.Keys.UP ||
			e.keyCode === OO.ui.Keys.DOWN ||
			e.keyCode === OO.ui.Keys.LEFT ||
			e.keyCode === OO.ui.Keys.RIGHT
		);

	/**
	 * Determine whether a position is editable, and if so which focusable node it is in
	 *
	 * We can land inside ce=false in many browsers:
	 * - Firefox has normal cursor positions at most node boundaries inside ce=false
	 * - Chromium has superfluous cursor positions around a ce=false img
	 * - IE hardly restricts editing at all inside ce=false
	 * If ce=false then we have landed inside the focusable node.
	 * If we land in a non-text position, assume we should have hit the node
	 * immediately after the position we hit (in the direction of motion)
	 * If we land inside a sequence of grouped nodes, assume we should treat them as a
	 * unit instead of letting the cursor slip inside them.

	 * @private
	 * @param {Node} DOM node of cursor position
	 * @param {number} offset Offset of cursor position
	 * @param {number} direction Cursor motion direction (1=forward, -1=backward)
	 * @return {ve.ce.Node|null} node, or null if not in a focusable node
	 */
	function getSurroundingFocusableNode( node, offset, direction ) {
		var focusNode, $focusNode;
		if ( node.nodeType === Node.TEXT_NODE ) {
			focusNode = node;
		} else if ( direction > 0 && offset < node.childNodes.length ) {
			focusNode = node.childNodes[ offset ];
		} else if ( direction < 0 && offset > 0 ) {
			focusNode = node.childNodes[ offset - 1 ];
		} else {
			focusNode = node;
		}

		$focusNode = $( focusNode );
		// If the first ancestor with contenteditable set is ce=true, then we are allowed
		// to be inside this focusalbe node (e.g. editing a table cell or caption)
		if ( $focusNode.closest( '[contenteditable]' ).prop( 'contenteditable' ) === 'true' ) {
			return null;
		}
		return $focusNode.closest( '.ve-ce-focusableNode, .ve-ce-tableNode' ).data( 'view' ) || null;
	}

	/**
	 * Compute the direction of cursor movement, if any
	 *
	 * Even if the user pressed a cursor key in the interior of the document, there may not
	 * be any movement: browser BIDI and ce=false handling can be quite quirky.
	 *
	 * Furthermore, the keydown selection nodes may have become detached since keydown (e.g.
	 * if ve.ce.ContentBranchNode#renderContents has run).
	 *
	 * @return {number|null} negative for startwards, positive for endwards, null for none
	 */
	function getDirection() {
		return (
			isArrow &&
			ve.compareDocumentOrder(
				surface.nativeSelection.focusNode,
				surface.nativeSelection.focusOffset,
				surface.keyDownState.selection.focusNode,
				surface.keyDownState.selection.focusOffset
			)
		) || null;
	}

	if (
		( e.keyCode === OO.ui.Keys.BACKSPACE || e.keyCode === OO.ui.Keys.DELETE ) &&
		this.nativeSelection.focusNode
	) {
		inNonSlug = this.nativeSelection.focusNode.nodeType === Node.ELEMENT_NODE &&
			!this.nativeSelection.focusNode.classList.contains( 've-ce-branchNode-inlineSlug' );
		if ( inNonSlug ) {
			// In a non-slug element. Sync the DM, then see if we need a slug.
			this.incRenderLock();
			try {
				this.surfaceObserver.pollOnce();
			} finally {
				this.decRenderLock();
			}

			dmSelection = surface.model.getSelection();
			if ( dmSelection instanceof ve.dm.LinearSelection ) {
				dmFocus = dmSelection.getRange().end;
				ceNode = this.documentView.getBranchNodeFromOffset( dmFocus );
				if ( ceNode && ceNode.getModel().hasSlugAtOffset( dmFocus ) ) {
					ceNode.setupBlockSlugs();
				}
			}
		}

		// Remove then re-set the selection, to clear any browser-native preannotations.
		// This should be IME-safe because delete/backspace key events should only happen
		// when there is no IME candidate window open.
		//
		// Note that if an IME removes text otherwise than by delete/backspace, then
		// browser-native preannotations might still get applied. This can happen: see
		// https://phabricator.wikimedia.org/T116275 .
		// That's nasty, but it's not a reason to leave the delete/backspace case broken.
		ceSelection = new ve.SelectionState( this.nativeSelection );
		this.nativeSelection.removeAllRanges();
		this.showSelectionState( ceSelection );

		if ( inNonSlug ) {
			return;
		}
	}

	if ( e !== this.keyDownState.event ) {
		return;
	}

	// Only fixup cursoring on linear selections.
	if ( isArrow && !( surface.model.getSelection() instanceof ve.dm.LinearSelection ) ) {
		return;
	}

	// Restore the selection and stop, if we cursored out of a table edit cell.
	// Assumption: if we cursored out of a table cell, then none of the fixups below this point
	// would have got the selection back inside the cell. Therefore it's OK to check here.
	if ( isArrow && this.restoreActiveTableNodeSelection() ) {
		return;
	}

	// If we landed in a cursor holder, select the corresponding focusable node instead
	// (which, for a table, will select the first cell). Else if we arrowed a collapsed
	// cursor across a focusable node, select the node instead.
	$focusNode = $( this.nativeSelection.focusNode );
	if ( $focusNode.hasClass( 've-ce-cursorHolder' ) ) {
		if ( $focusNode.hasClass( 've-ce-cursorHolder-after' ) ) {
			direction = -1;
			focusableNode = $focusNode.prev().data( 'view' );
		} else {
			direction = 1;
			focusableNode = $focusNode.next().data( 'view' );
		}
		this.removeCursorHolders();
	} else if (
		// If we arrowed a collapsed cursor into/across a focusable node, select the node instead
		isArrow &&
		!e.ctrlKey &&
		!e.altKey &&
		!e.metaKey &&
		this.keyDownState.selection.isCollapsed &&
		this.nativeSelection.isCollapsed &&
		( direction = getDirection() ) !== null
	) {
		focusableNode = getSurroundingFocusableNode(
			this.nativeSelection.focusNode,
			this.nativeSelection.focusOffset,
			direction
		);

		if ( !focusableNode ) {
			// Calculate the DM offsets of our motion
			try {
				startOffset = ve.ce.getOffset(
					this.keyDownState.selection.focusNode,
					this.keyDownState.selection.focusOffset
				);
				endOffset = ve.ce.getOffset(
					this.nativeSelection.focusNode,
					this.nativeSelection.focusOffset
				);
				offsetDiff = endOffset - startOffset;
			} catch ( ex ) {
				startOffset = endOffset = offsetDiff = undefined;
			}

			if ( Math.abs( offsetDiff ) === 2 ) {
				// Test whether we crossed a focusable node
				// (this applies even if we cursored up/down)
				focusableNode = (
					this.model.documentModel.documentNode
					.getNodeFromOffset( ( startOffset + endOffset ) / 2 )
				);

				if ( focusableNode.isFocusable() ) {
					range = new ve.Range( startOffset, endOffset );
				} else {
					focusableNode = undefined;
				}
			}
		}
	}

	if ( focusableNode ) {
		if ( !range ) {
			range = focusableNode.getOuterRange();
			if ( direction < 0 ) {
				range = range.flip();
			}
		}
		if ( focusableNode instanceof ve.ce.TableNode ) {
			if ( direction > 0 ) {
				this.model.setSelection( new ve.dm.TableSelection(
					this.model.documentModel, range, 0, 0
				) );
			} else {
				matrix = focusableNode.getModel().getMatrix();
				this.model.setSelection( new ve.dm.TableSelection(
					this.model.documentModel, range, matrix.getColCount() - 1, matrix.getRowCount() - 1
				) );
			}
		} else {
			this.model.setLinearSelection( range );
		}
		if ( e.keyCode === OO.ui.Keys.LEFT ) {
			this.cursorDirectionality = direction > 0 ? 'rtl' : 'ltr';
		} else if ( e.keyCode === OO.ui.Keys.RIGHT ) {
			this.cursorDirectionality = direction < 0 ? 'rtl' : 'ltr';
		}
		// else up/down pressed; leave this.cursorDirectionality as null
		// (it was set by setLinearSelection calling onModelSelect)
	}

	fixupCursorForUnicorn = (
		!e.shiftKey &&
		( e.keyCode === OO.ui.Keys.LEFT || e.keyCode === OO.ui.Keys.RIGHT )
	);
	this.incRenderLock();
	try {
		this.surfaceObserver.pollOnce();
	} finally {
		this.decRenderLock();
	}
	this.checkUnicorns( fixupCursorForUnicorn );
	if ( direction === undefined ) {
		direction = getDirection();
	}
	this.fixupCursorPosition( direction, e.shiftKey );
};

/**
 * Check whether the selection has moved out of the unicorned area (i.e. is not currently between
 * two unicorns) and if so, destroy the unicorns. If there are no active unicorns, this function
 * does nothing.
 *
 * If the unicorns are destroyed as a consequence of the user moving the cursor across a unicorn
 * with the arrow keys, the cursor will have to be moved again to produce the cursor movement
 * the user expected. Set the fixupCursor parameter to true to enable this behavior.
 *
 * @param {boolean} fixupCursor If destroying unicorns, fix the cursor position for expected movement
 */
ve.ce.Surface.prototype.checkUnicorns = function ( fixupCursor ) {
	var preUnicorn, postUnicorn, range, node, fixup;
	if ( !this.unicorningNode || !this.unicorningNode.unicorns ) {
		return;
	}
	preUnicorn = this.unicorningNode.unicorns[ 0 ];
	postUnicorn = this.unicorningNode.unicorns[ 1 ];
	if ( !this.$document[ 0 ].contains( preUnicorn ) ) {
		return;
	}

	if ( this.nativeSelection.rangeCount === 0 ) {
		// XXX do we want to clear unicorns in this case?
		return;
	}
	range = this.nativeSelection.getRangeAt( 0 );

	// Test whether the selection endpoint is between unicorns. If so, do nothing.
	// Unicorns can only contain text, so just move backwards until we hit a non-text node.
	node = range.endContainer;
	if ( node.nodeType === Node.ELEMENT_NODE ) {
		node = range.endOffset > 0 ? node.childNodes[ range.endOffset - 1 ] : null;
	}
	while ( node !== null && node.nodeType === Node.TEXT_NODE ) {
		node = node.previousSibling;
	}
	if ( node === preUnicorn ) {
		return;
	}

	// Selection endpoint is not between unicorns.
	// Test whether it is before or after the pre-unicorn (i.e. before/after both unicorns)
	if ( ve.compareDocumentOrder(
		range.endContainer,
		range.endOffset,
		preUnicorn.parentNode,
		Array.prototype.indexOf.call( preUnicorn.parentNode.childNodes, preUnicorn )
	) < 0 ) {
		// before the pre-unicorn
		fixup = -1;
	} else {
		// at or after the pre-unicorn (actually must be after the post-unicorn)
		fixup = 1;
	}
	if ( fixupCursor ) {
		this.incRenderLock();
		try {
			this.moveModelCursor( fixup );
		} finally {
			this.decRenderLock();
		}
	}
	this.renderSelectedContentBranchNode();
	this.showModelSelection( this.getModel().getSelection() );
};

/**
 * Handle document key up events.
 *
 * @method
 * @param {jQuery.Event} e Key up event
 * @fires keyup
 */
ve.ce.Surface.prototype.onDocumentKeyUp = function () {
	this.emit( 'keyup' );
};

/**
 * Handle cut events.
 *
 * @method
 * @param {jQuery.Event} e Cut event
 */
ve.ce.Surface.prototype.onCut = function ( e ) {
	var surface = this;
	this.onCopy( e );
	setTimeout( function () {
		surface.getModel().getFragment().delete().select();
	} );
};

/**
 * Handle copy events.
 *
 * @method
 * @param {jQuery.Event} e Copy event
 */
ve.ce.Surface.prototype.onCopy = function ( e ) {
	var originalSelection,
		clipboardIndex, clipboardItem,
		scrollTop, unsafeSelector, range, slice,
		selection = this.getModel().getSelection(),
		view = this,
		htmlDoc = this.getModel().getDocument().getHtmlDocument(),
		clipboardData = e.originalEvent.clipboardData;

	this.$pasteTarget.empty();

	if ( selection instanceof ve.dm.LinearSelection ||
		( selection instanceof ve.dm.TableSelection && selection.isSingleCell() )
	) {
		range = selection.getRanges()[ 0 ];
	} else {
		return;
	}

	slice = this.model.documentModel.cloneSliceFromRange( range );

	// Clone the elements in the slice
	slice.data.cloneElements( true );

	ve.dm.converter.getDomSubtreeFromModel( slice, this.$pasteTarget[ 0 ], true );

	// Some browsers strip out spans when they match the styling of the
	// paste target (e.g. plain spans) so we must protect against this
	// by adding a dummy class, which we can remove after paste.
	this.$pasteTarget.find( 'span' ).addClass( 've-pasteProtect' );

	// href absolutization either doesn't occur (because we copy HTML to the clipboard
	// directly with clipboardData#setData) or it resolves against the wrong document
	// (window.document instead of ve.dm.Document#getHtmlDocument) so do it manually
	// with ve#resolveUrl
	this.$pasteTarget.find( 'a' ).attr( 'href', function ( i, href ) {
		return ve.resolveUrl( href, htmlDoc );
	} );

	// Some attributes (e.g RDFa attributes in Firefox) aren't preserved by copy
	unsafeSelector = '[' + ve.ce.Surface.static.unsafeAttributes.join( '],[' ) + ']';
	this.$pasteTarget.find( unsafeSelector ).each( function () {
		var i, val,
			attrs = {},
			ua = ve.ce.Surface.static.unsafeAttributes;

		i = ua.length;
		while ( i-- ) {
			val = this.getAttribute( ua[ i ] );
			if ( val !== null ) {
				attrs[ ua[ i ] ] = val;
			}
		}
		this.setAttribute( 'data-ve-attributes', JSON.stringify( attrs ) );
	} );

	clipboardItem = { slice: slice, hash: null };
	clipboardIndex = this.clipboard.push( clipboardItem ) - 1;

	// Check we have a W3C clipboardData API
	if (
		clipboardData && clipboardData.items
	) {
		// Webkit allows us to directly edit the clipboard
		// Disable the default event so we can override the data
		e.preventDefault();

		clipboardData.setData( 'text/xcustom', this.clipboardId + '-' + clipboardIndex );
		// As we've disabled the default event we need to set the normal clipboard data
		// It is apparently impossible to set text/xcustom without setting the other
		// types manually too.
		clipboardData.setData( 'text/html', this.$pasteTarget.html() );
		clipboardData.setData( 'text/plain', this.$pasteTarget.text() );
	} else {
		clipboardItem.hash = this.constructor.static.getClipboardHash( this.$pasteTarget.contents() );
		this.$pasteTarget.prepend(
			$( '<span>' ).attr( 'data-ve-clipboard-key', this.clipboardId + '-' + clipboardIndex ).html( '&nbsp;' )
		);

		// If direct clipboard editing is not allowed, we must use the pasteTarget to
		// select the data we want to go in the clipboard
		if ( this.getModel().getSelection() instanceof ve.dm.LinearSelection ) {
			// We have a selection in the document; preserve it so it can restored
			originalSelection = new ve.SelectionState( this.nativeSelection );

			// Save scroll position before changing focus to "offscreen" paste target
			scrollTop = this.$window.scrollTop();

			// Prevent surface observation due to native range changing
			this.surfaceObserver.disable();
			ve.selectElement( this.$pasteTarget[ 0 ] );

			// Restore scroll position after changing focus
			this.$window.scrollTop( scrollTop );

			setTimeout( function () {
				// If the range was in $highlights (right-click copy), don't restore it
				if ( !OO.ui.contains( view.$highlights[ 0 ], originalSelection.focusNode, true ) ) {
					// Change focus back
					view.$documentNode[ 0 ].focus();
					view.showSelectionState( originalSelection );
					// Restore scroll position
					view.$window.scrollTop( scrollTop );
				}
				view.surfaceObserver.clear();
				view.surfaceObserver.enable();
			} );
		} else {
			// If nativeRange is null, the pasteTarget *should* already be selected...
			ve.selectElement( this.$pasteTarget[ 0 ] );
		}
	}
};

/**
 * Handle native paste event
 *
 * @param {jQuery.Event} e Paste event
 */
ve.ce.Surface.prototype.onPaste = function ( e ) {
	var surface = this;
	// Prevent pasting until after we are done
	if ( this.pasting ) {
		return false;
	}
	this.beforePaste( e );
	this.surfaceObserver.disable();
	this.pasting = true;
	setTimeout( function () {
		try {
			if ( !e.isDefaultPrevented() ) {
				surface.afterPaste( e );
			}
		} finally {
			surface.surfaceObserver.clear();
			surface.surfaceObserver.enable();

			// Allow pasting again
			surface.pasting = false;
			surface.pasteSpecial = false;
			surface.beforePasteData = null;
		}
	} );
};

/**
 * Handle pre-paste events.
 *
 * @param {jQuery.Event} e Paste event
 */
ve.ce.Surface.prototype.beforePaste = function ( e ) {
	var tx, range, node, nodeRange, contextElement, nativeRange,
		context, leftText, rightText, textNode, textStart, textEnd,
		selection = this.getModel().getSelection(),
		clipboardData = e.originalEvent.clipboardData,
		doc = this.getModel().getDocument();

	if ( selection instanceof ve.dm.LinearSelection ||
		( selection instanceof ve.dm.TableSelection && selection.isSingleCell() )
	) {
		range = selection.getRanges()[ 0 ];
	} else {
		e.preventDefault();
		return;
	}

	this.beforePasteData = {};
	if ( clipboardData ) {
		if ( this.handleDataTransfer( clipboardData, true ) ) {
			e.preventDefault();
			return;
		}
		this.beforePasteData.custom = clipboardData.getData( 'text/xcustom' );
		this.beforePasteData.html = clipboardData.getData( 'text/html' );
		if ( this.beforePasteData.html ) {
			// http://msdn.microsoft.com/en-US/en-%20us/library/ms649015(VS.85).aspx
			this.beforePasteData.html = this.beforePasteData.html
				.replace( /^[\s\S]*<!-- *StartFragment *-->/, '' )
				.replace( /<!-- *EndFragment *-->[\s\S]*$/, '' );
		}
	}

	// Pasting into a range? Remove first.
	if ( !range.isCollapsed() ) {
		tx = ve.dm.Transaction.newFromRemoval( doc, range );
		selection = selection.translateByTransaction( tx );
		this.model.change( tx, selection );
		range = selection.getRanges()[ 0 ];
	}

	// Save scroll position before changing focus to "offscreen" paste target
	this.beforePasteData.scrollTop = this.$window.scrollTop();

	this.$pasteTarget.empty();

	// Get node from cursor position
	node = doc.getBranchNodeFromOffset( range.start );
	if ( node.canContainContent() ) {
		// If this is a content branch node, then add its DM HTML
		// to the paste target to give CE some context.
		textStart = textEnd = 0;
		nodeRange = node.getRange();
		contextElement = node.getClonedElement();
		// Make sure that context doesn't have any attributes that might confuse
		// the importantElement check in afterPaste.
		$( contextElement.originalDomElements ).removeAttr( 'id typeof rel' );
		context = [ contextElement ];
		// If there is content to the left of the cursor, put a placeholder
		// character to the left of the cursor
		if ( range.start > nodeRange.start ) {
			leftText = '☀';
			context.push( leftText );
			textStart = textEnd = 1;
		}
		// If there is content to the right of the cursor, put a placeholder
		// character to the right of the cursor
		if ( range.end < nodeRange.end ) {
			rightText = '☂';
			context.push( rightText );
		}
		// If there is no text context, select some text to be replaced
		if ( !leftText && !rightText ) {
			context.push( '☁' );
			textEnd = 1;
		}
		context.push( { type: '/' + context[ 0 ].type } );

		// Throw away 'internal', specifically inner whitespace,
		// before conversion as it can affect textStart/End offsets.
		delete contextElement.internal;
		ve.dm.converter.getDomSubtreeFromModel(
			new ve.dm.Document(
				new ve.dm.ElementLinearData( doc.getStore(), context ),
				doc.getHtmlDocument(), undefined, doc.getInternalList(),
				doc.getLang(), doc.getDir()
			),
			this.$pasteTarget[ 0 ]
		);

		// Giving the paste target focus too late can cause problems in FF (!?)
		// so do it up here.
		this.$pasteTarget[ 0 ].focus();

		nativeRange = this.getElementDocument().createRange();
		// Assume that the DM node only generated one child
		textNode = this.$pasteTarget.children().contents()[ 0 ];
		// Place the cursor between the placeholder characters
		nativeRange.setStart( textNode, textStart );
		nativeRange.setEnd( textNode, textEnd );
		this.nativeSelection.removeAllRanges();
		this.nativeSelection.addRange( nativeRange );

		this.beforePasteData.context = context;
		this.beforePasteData.leftText = leftText;
		this.beforePasteData.rightText = rightText;
	} else {
		// If we're not in a content branch node, don't bother trying to do
		// anything clever with paste context
		this.$pasteTarget[ 0 ].focus();
	}

	// Restore scroll position after focusing the paste target
	this.$window.scrollTop( this.beforePasteData.scrollTop );

};

/**
 * Handle post-paste events.
 *
 * @param {jQuery.Event} e Paste event
 */
ve.ce.Surface.prototype.afterPaste = function ( e ) {
	// jshint unused:false
	var clipboardKey, clipboardId, clipboardIndex, clipboardHash, range,
		$elements, parts, pasteData, slice, tx, internalListRange,
		data, doc, htmlDoc, $images, i,
		context, left, right, contextRange,
		items = [],
		importantElement = '[id],[typeof],[rel]',
		importRules = !this.pasteSpecial ? this.getSurface().getImportRules() : { all: { plainText: true } },
		beforePasteData = this.beforePasteData || {},
		selection = this.model.getSelection(),
		view = this;

	// If the selection doesn't collapse after paste then nothing was inserted
	if ( !this.nativeSelection.isCollapsed ) {
		return;
	}

	if ( selection instanceof ve.dm.LinearSelection ||
		( selection instanceof ve.dm.TableSelection && selection.isSingleCell() )
	) {
		range = selection.getRanges()[ 0 ];
	} else {
		return;
	}

	// Remove style attributes. Any valid styles will be restored by data-ve-attributes.
	this.$pasteTarget.find( '[style]' ).removeAttr( 'style' );

	// Remove the pasteProtect class (see #onCopy) and unwrap empty spans.
	this.$pasteTarget.find( 'span' ).each( function () {
		var $this = $( this );
		$this.removeClass( 've-pasteProtect' );
		if ( $this.attr( 'class' ) === '' ) {
			$this.removeAttr( 'class' );
		}
		// Unwrap empty spans
		if ( !this.attributes.length ) {
			$this.replaceWith( this.childNodes );
		}
	} );

	// Restore attributes. See #onCopy.
	this.$pasteTarget.find( '[data-ve-attributes]' ).each( function () {
		var attrs;
		try {
			attrs = JSON.parse( this.getAttribute( 'data-ve-attributes' ) );
		} catch ( e ) {
			// Invalid JSON
			return;
		}
		$( this ).attr( attrs );
		this.removeAttribute( 'data-ve-attributes' );
	} );

	// Find the clipboard key
	if ( beforePasteData.custom ) {
		clipboardKey = beforePasteData.custom;
	} else {
		if ( beforePasteData.html ) {
			$elements = $( $.parseHTML( beforePasteData.html ) );

			// Try to find the clipboard key hidden in the HTML
			$elements = $elements.filter( function () {
				var val = this.getAttribute && this.getAttribute( 'data-ve-clipboard-key' );
				if ( val ) {
					clipboardKey = val;
					// Remove the clipboard key span once read
					return false;
				}
				return true;
			} );
			clipboardHash = this.constructor.static.getClipboardHash( $elements );
		} else {
			// HTML in pasteTarget my get wrapped, so use the recursive $.find to look for the clipboard key
			clipboardKey = this.$pasteTarget.find( 'span[data-ve-clipboard-key]' ).data( 've-clipboard-key' );
			// Pass beforePasteData so context gets stripped
			clipboardHash = this.constructor.static.getClipboardHash( this.$pasteTarget, beforePasteData );
		}
	}

	// Remove the clipboard key
	this.$pasteTarget.find( 'span[data-ve-clipboard-key]' ).remove();

	// If we have a clipboard key, validate it and fetch data
	if ( clipboardKey ) {
		parts = clipboardKey.split( '-' );
		clipboardId = parts[ 0 ];
		clipboardIndex = parts[ 1 ];
		if ( clipboardId === this.clipboardId && this.clipboard[ clipboardIndex ] ) {
			// Hash validation: either text/xcustom was used or the hash must be
			// equal to the hash of the pasted HTML to assert that the HTML
			// hasn't been modified in another editor before being pasted back.
			if ( beforePasteData.custom ||
				this.clipboard[ clipboardIndex ].hash === clipboardHash
			) {
				slice = this.clipboard[ clipboardIndex ].slice;
			}
		}
	}

	if ( slice ) {
		// Internal paste
		try {
			// Try to paste in the original data
			// Take a copy to prevent the data being annotated a second time in the catch block
			// and to prevent actions in the data model affecting view.clipboard
			pasteData = new ve.dm.ElementLinearData(
				slice.getStore(),
				ve.copy( slice.getOriginalData() )
			);

			if ( importRules.all ) {
				pasteData.sanitize( importRules.all );
			}

			// Annotate
			ve.dm.Document.static.addAnnotationsToData( pasteData.getData(), this.model.getInsertionAnnotations() );

			// Transaction
			tx = ve.dm.Transaction.newFromInsertion(
				this.documentView.model,
				range.start,
				pasteData.getData()
			);
		} catch ( err ) {
			// If that fails, use the balanced data
			// Take a copy to prevent actions in the data model affecting view.clipboard
			pasteData = new ve.dm.ElementLinearData(
				slice.getStore(),
				ve.copy( slice.getBalancedData() )
			);

			if ( importRules.all ) {
				pasteData.sanitize( importRules.all );
			}

			// Annotate
			ve.dm.Document.static.addAnnotationsToData( pasteData.getData(), this.model.getInsertionAnnotations() );

			// Transaction
			tx = ve.dm.Transaction.newFromInsertion(
				this.documentView.model,
				range.start,
				pasteData.getData()
			);
		}
	} else {
		if ( clipboardKey && beforePasteData.html ) {
			// If the clipboardKey is set (paste from other VE instance), and clipboard
			// data is available, then make sure important spans haven't been dropped
			if ( !$elements ) {
				$elements = $( $.parseHTML( beforePasteData.html ) );
			}
			if (
				// HACK: Allow the test runner to force the use of clipboardData
				clipboardKey === 'useClipboardData-0' || (
					$elements.find( importantElement ).andSelf().filter( importantElement ).length > 0 &&
					this.$pasteTarget.find( importantElement ).length === 0
				)
			) {
				// CE destroyed an important element, so revert to using clipboard data
				htmlDoc = ve.createDocumentFromHtml( beforePasteData.html );
				// Remove the pasteProtect class. See #onCopy.
				$( htmlDoc ).find( 'span' ).removeClass( 've-pasteProtect' );
				beforePasteData.context = null;
			}
		}
		if ( !htmlDoc ) {
			// If there were no problems, let CE do its sanitizing as it may
			// contain all sorts of horrible metadata (head tags etc.)
			// TODO: IE will always take this path, and so may have bugs with span unwrapping
			// in edge cases (e.g. pasting a single MWReference)
			htmlDoc = ve.createDocumentFromHtml( this.$pasteTarget.html() );
		}
		// Some browsers don't provide pasted image data through the clipboardData API and
		// instead create img tags with data URLs, so detect those here
		$images = $( htmlDoc.body ).find( 'img[src^=data\\:]' );
		if ( $images.length ) {
			for ( i = 0; i < $images.length; i++ ) {
				items.push( ve.ui.DataTransferItem.static.newFromDataUri(
					$images.eq( i ).attr( 'src' ),
					$images[ i ].outerHTML
				) );
			}
			if ( this.handleDataTransferItems( items, true ) ) {
				return;
			}
		}
		// External paste
		doc = ve.dm.converter.getModelFromDom( htmlDoc, {
			targetDoc: this.getModel().getDocument().getHtmlDocument(),
			fromClipboard: true
		} );
		data = doc.data;
		// Clear metadata
		doc.metadata = new ve.dm.MetaLinearData( doc.getStore(), new Array( 1 + data.getLength() ) );
		// If the clipboardKey isn't set (paste from non-VE instance) use external import rules
		if ( !clipboardKey ) {
			data.sanitize( importRules.external || {} );
			if ( importRules.all ) {
				data.sanitize( importRules.all );
			}
		} else {
			data.sanitize( importRules.all || {} );
		}
		data.remapInternalListKeys( this.model.getDocument().getInternalList() );

		// Initialize node tree
		doc.buildNodeTree();

		// If the paste was given context, calculate the range of the inserted data
		if ( beforePasteData.context ) {
			internalListRange = doc.getInternalList().getListNode().getOuterRange();
			context = new ve.dm.ElementLinearData(
				doc.getStore(),
				ve.copy( beforePasteData.context )
			);
			if ( this.pasteSpecial ) {
				// The context may have been sanitized, so sanitize here as well for comparison
				context.sanitize( importRules, true );
			}

			// Remove matching context from the left
			left = 0;
			while (
				context.getLength() &&
				ve.dm.ElementLinearData.static.compareElements(
					data.getData( left ),
					data.isElementData( left ) ? context.getData( 0 ) : beforePasteData.leftText
				)
			) {
				left++;
				context.splice( 0, 1 );
			}

			// Remove matching context from the right
			right = internalListRange.start;
			while (
				right > 0 &&
				context.getLength() &&
				ve.dm.ElementLinearData.static.compareElements(
					data.getData( right - 1 ),
					data.isElementData( right - 1 ) ? context.getData( context.getLength() - 1 ) : beforePasteData.rightText
				)
			) {
				right--;
				context.splice( context.getLength() - 1, 1 );
			}
			// HACK: Strip trailing linebreaks probably introduced by Chrome bug
			while ( right > 0 && data.getType( right - 1 ) === 'break' ) {
				right--;
			}
			contextRange = new ve.Range( left, right );
		}

		tx = ve.dm.Transaction.newFromDocumentInsertion(
			this.documentView.model,
			range.start,
			doc,
			contextRange
		);
	}

	// Restore focus and scroll position
	this.$documentNode[ 0 ].focus();
	this.$window.scrollTop( beforePasteData.scrollTop );
	// Firefox sometimes doesn't change scrollTop immediately when pasting
	// line breaks at the end of a line so do it again later.
	setTimeout( function () {
		view.$window.scrollTop( beforePasteData.scrollTop );
	} );

	selection = selection.translateByTransaction( tx );
	this.model.change( tx, selection.collapseToStart() );
	// Move cursor to end of selection
	this.model.setSelection( selection.collapseToEnd() );
};

/**
 * Handle the insertion of a data transfer object
 *
 * @param {DataTransfer} dataTransfer Data transfer
 * @param {boolean} isPaste Handlers being used for paste
 * @param {ve.dm.SurfaceFragment} [targetFragment] Fragment to inserto data items at, defaults to current selection
 * @return {boolean} One more items was handled
 */
ve.ce.Surface.prototype.handleDataTransfer = function ( dataTransfer, isPaste, targetFragment ) {
	var i, l, stringData,
		items = [],
		htmlStringData = dataTransfer.getData( 'text/html' ),
		stringTypes = [ 'text/x-moz-url', 'text/uri-list', 'text/x-uri', 'text/html', 'text/plain' ];

	if ( dataTransfer.items ) {
		for ( i = 0, l = dataTransfer.items.length; i < l; i++ ) {
			if ( dataTransfer.items[ i ].kind !== 'string' ) {
				items.push( ve.ui.DataTransferItem.static.newFromItem( dataTransfer.items[ i ], htmlStringData ) );
			}
		}
	} else if ( dataTransfer.files ) {
		for ( i = 0, l = dataTransfer.files.length; i < l; i++ ) {
			items.push( ve.ui.DataTransferItem.static.newFromBlob( dataTransfer.files[ i ], htmlStringData ) );
		}
	}

	for ( i = 0, l = stringTypes.length; i < stringTypes.length; i++ ) {
		stringData = dataTransfer.getData( stringTypes[ i ] );
		if ( stringData ) {
			items.push( ve.ui.DataTransferItem.static.newFromString( stringData, stringTypes[ i ], htmlStringData ) );
		}
	}

	return this.handleDataTransferItems( items, isPaste, targetFragment );
};

/**
 * Handle the insertion of data tranfer items
 *
 * @param {ve.ui.DataTransferItem[]} items Data transfer items
 * @param {boolean} isPaste Handlers being used for paste
 * @param {ve.dm.SurfaceFragment} [targetFragment] Fragment to inserto data items at, defaults to current selection
 * @return {boolean} One more items was handled
 */
ve.ce.Surface.prototype.handleDataTransferItems = function ( items, isPaste, targetFragment ) {
	var i, l, name,
		handled = false;

	targetFragment = targetFragment || this.getModel().getFragment();

	function insert( docOrData ) {
		var resultFragment = targetFragment.collapseToEnd();
		if ( docOrData instanceof ve.dm.Document ) {
			resultFragment.insertDocument( docOrData );
		} else {
			resultFragment.insertContent( docOrData );
		}
		// The resultFragment's selection now covers the inserted content;
		// adjust selection to end of inserted content.
		resultFragment.collapseToEnd().select();
	}

	for ( i = 0, l = items.length; i < l; i++ ) {
		name = ve.init.target.dataTransferHandlerFactory.getHandlerNameForItem( items[ i ], isPaste, this.pasteSpecial );
		if ( name ) {
			ve.init.target.dataTransferHandlerFactory.create( name, this.surface, items[ i ] )
				.getInsertableData().done( insert );
			handled = true;
			break;
		}
	}
	return handled;
};

/**
 * Select all the contents within the current context
 */
ve.ce.Surface.prototype.selectAll = function () {
	var internalListRange, range, matrix,
		selection = this.getModel().getSelection(),
		dmDoc = this.getModel().getDocument();

	if ( selection instanceof ve.dm.LinearSelection ) {
		if ( this.getActiveTableNode() && this.getActiveTableNode().getEditingFragment() ) {
			range = this.getActiveTableNode().getEditingRange();
			range = new ve.Range( range.from + 1, range.to - 1 );
		} else {
			internalListRange = this.getModel().getDocument().getInternalList().getListNode().getOuterRange();
			range = new ve.Range(
				dmDoc.getNearestCursorOffset( 0, 1 ),
				dmDoc.getNearestCursorOffset( internalListRange.start, -1 )
			);
		}
		this.getModel().setLinearSelection( range );
	} else if ( selection instanceof ve.dm.TableSelection ) {
		matrix = selection.getTableNode().getMatrix();
		this.getModel().setSelection(
			new ve.dm.TableSelection(
				selection.getDocument(), selection.tableRange,
				0, 0, matrix.getColCount() - 1, matrix.getRowCount() - 1
			)
		);

	}
};

/**
 * Handle document composition end events.
 *
 * @method
 * @param {jQuery.Event} e Input event
 */
ve.ce.Surface.prototype.onDocumentInput = function () {
	this.incRenderLock();
	try {
		this.surfaceObserver.pollOnce();
	} finally {
		this.decRenderLock();
	}
};

/*! Custom Events */

/**
 * Handle model select events.
 *
 * @see ve.dm.Surface#method-change
 */
ve.ce.Surface.prototype.onModelSelect = function () {
	var focusedNode, blockSlug,
		selection = this.getModel().getSelection();

	this.cursorDirectionality = null;
	this.contentBranchNodeChanged = false;

	if ( selection instanceof ve.dm.NullSelection ) {
		this.removeCursorHolders();
	}

	if ( selection instanceof ve.dm.LinearSelection ) {
		blockSlug = this.findBlockSlug( selection.getRange() );
		if ( blockSlug !== this.focusedBlockSlug ) {
			if ( this.focusedBlockSlug ) {
				this.focusedBlockSlug.classList.remove(
					've-ce-branchNode-blockSlug-focused'
				);
				this.focusedBlockSlug = null;
			}

			if ( blockSlug ) {
				blockSlug.classList.add( 've-ce-branchNode-blockSlug-focused' );
				this.focusedBlockSlug = blockSlug;
				this.preparePasteTargetForCopy();
			}
		}

		focusedNode = this.findFocusedNode( selection.getRange() );

		// If focus has changed, update nodes and this.focusedNode
		if ( focusedNode !== this.focusedNode ) {
			if ( this.focusedNode ) {
				this.focusedNode.setFocused( false );
				this.focusedNode = null;
			}
			if ( focusedNode ) {
				focusedNode.setFocused( true );
				this.focusedNode = focusedNode;

				// If dragging, we already have a native selection, so don't mess with it
				if ( !this.dragging ) {
					this.preparePasteTargetForCopy();
					// Since the selection is no longer in the documentNode, clear the SurfaceObserver's
					// selection state. Otherwise, if the user places the selection back into the documentNode
					// in exactly the same place where it was before, the observer won't consider that a change.
					this.surfaceObserver.clear();
				}
				// If the node is outside the view, scroll to it
				ve.scrollIntoView( this.focusedNode.$element.get( 0 ) );
			}
		}
	} else {
		if ( selection instanceof ve.dm.TableSelection ) {
			this.preparePasteTargetForCopy();
		}
		if ( this.focusedNode ) {
			this.focusedNode.setFocused( false );
		}
		this.focusedNode = null;
	}

	// Ignore the selection if changeModelSelection is currently being
	// called with the same (object-identical) selection object
	// (i.e. if the model is calling us back)
	if ( !this.isRenderingLocked() && selection !== this.newModelSelection ) {
		this.showModelSelection( selection );
		this.checkUnicorns( false );
	}
	// Update the selection state in the SurfaceObserver
	this.surfaceObserver.pollOnceNoCallback();
};

/**
 * Prepare the paste target for a copy event by selecting some text
 */
ve.ce.Surface.prototype.preparePasteTargetForCopy = function () {
	// As FF won't fire a copy event with nothing selected, create a native selection.
	// If there is a focusedNode available, use its text content so that context menu
	// items such as "Search for [SELECTED TEXT]" make sense. If the text is empty or
	// whitespace, use a single unicode character as this is required for programmatic
	// selection to work correctly in all browsers (e.g. Safari won't select a single space).
	// #onCopy will ignore this native selection and use the DM selection
	if ( !this.getSurface().isMobile() ) {
		this.$pasteTarget.text( ( this.focusedNode && this.focusedNode.$element.text().trim() ) || '☢' );
		ve.selectElement( this.$pasteTarget[ 0 ] );
		this.$pasteTarget[ 0 ].focus();
	} else {
		// Selecting the paste target fails on mobile:
		// * On iOS The selection stays visible and causes scrolling
		// * The user is unlikely to be able to trigger a keyboard copy anyway
		// Instead just deactivate the surface so the native cursor doesn't
		// get in the way and the on screen keyboard doesn't show.
		// TODO: Provide a copy tool in the context menu
		this.deactivate();
	}
};

/**
 * Get the focused node (optionally at a specified range), or null if one is not present
 *
 * @param {ve.Range} [range] Optional range to check for focused node, defaults to current selection's range
 * @return {ve.ce.Node|null} Focused node
 */
ve.ce.Surface.prototype.getFocusedNode = function ( range ) {
	var selection;
	if ( !range ) {
		return this.focusedNode;
	}
	selection = this.getModel().getSelection();
	if (
		selection instanceof ve.dm.LinearSelection &&
		range.equalsSelection( selection.getRange() )
	) {
		return this.focusedNode;
	}
	return this.findFocusedNode( range );
};

/**
 * Find the block slug a given range is in.
 *
 * @param {ve.Range} range Range to check
 * @return {HTMLElement|null} Slug, or null if no slug or if range is not collapsed
 */
ve.ce.Surface.prototype.findBlockSlug = function ( range ) {
	if ( !range.isCollapsed() ) {
		return null;
	}
	return this.documentView.getDocumentNode().getSlugAtOffset( range.end );
};

/**
 * Find the focusedNode at a specified range
 *
 * @param {ve.Range} range Range to search at for a focusable node
 * @return {ve.ce.Node|null} Focused node
 */
ve.ce.Surface.prototype.findFocusedNode = function ( range ) {
	var startNode, endNode,
		documentNode = this.documentView.getDocumentNode();
	// Detect when only a single focusable element is selected
	if ( !range.isCollapsed() ) {
		startNode = documentNode.getNodeFromOffset( range.start + 1 );
		if ( startNode && startNode.isFocusable() ) {
			endNode = documentNode.getNodeFromOffset( range.end - 1 );
			if ( startNode === endNode ) {
				return startNode;
			}
		}
	} else {
		// Check if the range is inside a focusable node with a collapsed selection
		startNode = documentNode.getNodeFromOffset( range.start );
		if ( startNode && startNode.isFocusable() ) {
			return startNode;
		}
	}
	return null;
};

/**
 * Handle documentUpdate events on the surface model.
 */
ve.ce.Surface.prototype.onModelDocumentUpdate = function () {
	var surface = this;
	if ( this.contentBranchNodeChanged ) {
		// Update the selection state from model
		this.onModelSelect();
	}
	// Update the state of the SurfaceObserver
	this.surfaceObserver.pollOnceNoCallback();
	// Wait for other documentUpdate listeners to run before emitting
	setTimeout( function () {
		surface.emit( 'position' );
	} );
};

/**
 * Handle insertionAnnotationsChange events on the surface model.
 *
 * @param {ve.dm.AnnotationSet} insertionAnnotations
 */
ve.ce.Surface.prototype.onInsertionAnnotationsChange = function () {
	var changed = this.renderSelectedContentBranchNode();
	if ( !changed ) {
		return;
	}
	// Must re-apply the selection after re-rendering
	this.showModelSelection( this.getModel().getSelection() );
	this.surfaceObserver.pollOnceNoCallback();
};

/**
 * Re-render the ContentBranchNode the selection is currently in.
 *
 * @return {boolean} Whether a re-render actually happened
 */
ve.ce.Surface.prototype.renderSelectedContentBranchNode = function () {
	var selection, ceNode;
	selection = this.model.getSelection();
	if ( !( selection instanceof ve.dm.LinearSelection ) ) {
		return false;
	}
	ceNode = this.documentView.getBranchNodeFromOffset( selection.getRange().start );
	if ( ceNode === null ) {
		return false;
	}
	if ( !( ceNode instanceof ve.ce.ContentBranchNode ) ) {
		// not a content branch node
		return false;
	}
	return ceNode.renderContents();
};

/**
 * Handle changes observed from the DOM
 *
 * These are normally caused by the user interacting directly with the contenteditable.
 *
 * @param {ve.ce.RangeState|null} oldState The prior range state, if any
 * @param {ve.ce.RangeState} newState The changed range state
 */

ve.ce.Surface.prototype.handleObservedChanges = function ( oldState, newState ) {
	var newSelection, dmContentChange,
		surface = this,
		dmDoc = this.getModel().getDocument(),
		insertedText = false;

	if ( newState.contentChanged ) {
		dmContentChange = ve.ce.modelChangeFromContentChange( oldState, newState );
		if ( !dmContentChange.rerender ) {
			this.incRenderLock();
		}
		try {
			this.changeModel( dmContentChange.transaction, dmContentChange.selection );
		} finally {
			if ( !dmContentChange.rerender ) {
				this.decRenderLock();
			}
		}

		insertedText = dmContentChange.transaction.operations.filter( function ( op ) {
			return op.type === 'replace' && op.insert.length;
		} ).length > 0;
	}

	if (
		newState.branchNodeChanged &&
		oldState &&
		oldState.node &&
		oldState.node.root &&
		oldState.node instanceof ve.ce.ContentBranchNode
	) {
		oldState.node.renderContents();
	}

	if ( newState.selectionChanged && !(
		// Ignore when the newRange is just a flipped oldRange
		oldState &&
		oldState.veRange &&
		newState.veRange &&
		!newState.veRange.isCollapsed() &&
		oldState.veRange.equalsSelection( newState.veRange )
	) ) {
		if ( newState.veRange ) {
			newSelection = new ve.dm.LinearSelection( dmDoc, newState.veRange );
		} else {
			newSelection = new ve.dm.NullSelection( dmDoc );
		}
		this.incRenderLock();
		try {
			this.changeModel( null, newSelection );
		} finally {
			this.decRenderLock();
		}
		this.checkUnicorns( false );

		// Firefox lets you create multiple selections within a single paragraph
		// which our model doesn't support, so detect and prevent these.
		// This shouldn't create problems with IME candidates as only an explicit user
		// action can create a multiple selection (CTRL+click), and we remove it
		// immediately, so there can never be a multiple selection while the user is
		// typing text; therefore the selection change will never commit IME candidates
		// prematurely.
		while ( this.nativeSelection.rangeCount > 1 ) {
			// The current range is the last range, so remove ranges from the front
			this.nativeSelection.removeRange( this.nativeSelection.getRangeAt( 0 ) );
		}
	}

	if ( insertedText ) {
		// Use setTimeout to escape current renderLock
		setTimeout( function () {
			surface.checkSequences();
		} );
	}
	if ( newState.branchNodeChanged && newState.node ) {
		this.updateCursorHolders();
		this.showModelSelection( this.getModel().getSelection() );
	}
};

/**
 * Create a slug out of a DOM element
 *
 * @param {HTMLElement} element Slug element
 */
ve.ce.Surface.prototype.createSlug = function ( element ) {
	var $slug,
		surface = this,
		offset = ve.ce.getOffsetOfSlug( element ),
		doc = this.getModel().getDocument();

	this.changeModel( ve.dm.Transaction.newFromInsertion(
		doc, offset, [
			{ type: 'paragraph', internal: { generated: 'slug' } },
			{ type: '/paragraph' }
		]
	), new ve.dm.LinearSelection( doc, new ve.Range( offset + 1 ) ) );

	// Animate the slug open
	$slug = this.getDocument().getDocumentNode().getNodeFromOffset( offset + 1 ).$element;
	$slug.addClass( 've-ce-branchNode-newSlug' );
	setTimeout( function () {
		$slug.addClass( 've-ce-branchNode-newSlug-open' );
		setTimeout( function () {
			surface.emit( 'position' );
		}, 200 );
	} );

	this.onModelSelect();
};

/**
 * Move cursor if it is between annotation nails
 *
 * @param {number} direction Direction of travel, 1=forwards, -1=backwards, 0=unknown
 * @param {boolean} extend Whether the anchor should stay where it is
 *
 * TODO: Improve name
 */
ve.ce.Surface.prototype.fixupCursorPosition = function ( direction, extend ) {
	var node, offset, previousNode, fixedPosition, nextNode;
	// Default to moving start-wards, to mimic typical Chromium behaviour
	direction = direction > 0 ? 1 : -1;

	if ( this.nativeSelection.rangeCount === 0 ) {
		return;
	}
	node = this.nativeSelection.focusNode;
	offset = this.nativeSelection.focusOffset;
	if ( node.nodeType !== Node.ELEMENT_NODE ) {
		return;
	}
	previousNode = node.childNodes[ offset - 1 ];
	nextNode = node.childNodes[ offset ];

	if (
		!(
			previousNode &&
			previousNode.nodeType === Node.ELEMENT_NODE && (
				previousNode.classList.contains( 've-ce-nail-pre-open' ) ||
				previousNode.classList.contains( 've-ce-nail-pre-close' )
			)
		) && !(
			nextNode &&
			nextNode.nodeType === Node.ELEMENT_NODE && (
				nextNode.classList.contains( 've-ce-nail-post-open' ) ||
				nextNode.classList.contains( 've-ce-nail-post-close' )
			)
		)
	) {
		return;
	}
	// Between nails: cross the one in the specified direction
	fixedPosition = ve.adjacentDomPosition( { node: node, offset: offset }, direction );
	node = fixedPosition.node;
	offset = fixedPosition.offset;
	if ( direction === -1 ) {
		// Moving startwards: left-bias the fixed position
		// Avoids Firefox bug "cursor disappears at left of img inside link":
		// https://bugzilla.mozilla.org/show_bug.cgi?id=1175495
		fixedPosition = ve.adjacentDomPosition( fixedPosition, direction );
		if ( fixedPosition.node.nodeType === Node.TEXT_NODE ) {
			// Have crossed into a text node; go back to its end
			node = fixedPosition.node;
			offset = fixedPosition.node.length;
		}
	}

	this.showSelectionState( new ve.SelectionState( {
		anchorNode: extend ? this.nativeSelection.anchorNode : node,
		anchorOffset: extend ? this.nativeSelection.anchorOffset : offset,
		focusNode: node,
		focusOffset: offset
	} ) );
};

/**
 * Check the current surface offset for sequence matches
 */
ve.ce.Surface.prototype.checkSequences = function () {
	var i, sequences,
		executed = false,
		model = this.getModel(),
		selection = model.getSelection();

	if ( !( selection instanceof ve.dm.LinearSelection ) ) {
		return;
	}

	sequences = ve.init.target.sequenceRegistry.findMatching( model.getDocument().data, selection.getRange().end );

	// sequences.length will likely be 0 or 1 so don't cache
	for ( i = 0; i < sequences.length; i++ ) {
		executed = sequences[ i ].sequence.execute( this.surface, sequences[ i ].range ) || executed;
	}
	if ( executed ) {
		this.showModelSelection( model.getSelection() );
	}
};

/**
 * Handle window resize event.
 *
 * @param {jQuery.Event} e Window resize event
 */
ve.ce.Surface.prototype.onWindowResize = ve.debounce( function () {
	this.emit( 'position' );
}, 50 );

/*! Relocation */

/**
 * Start a relocation action.
 *
 * @see ve.ce.FocusableNode
 *
 * @param {ve.ce.Node} node Node being relocated
 */
ve.ce.Surface.prototype.startRelocation = function ( node ) {
	this.relocatingNode = node;
	this.emit( 'relocationStart', node );
};

/**
 * Complete a relocation action.
 *
 * @see ve.ce.FocusableNode
 */
ve.ce.Surface.prototype.endRelocation = function () {
	if ( this.relocatingNode ) {
		this.emit( 'relocationEnd', this.relocatingNode );
		this.relocatingNode = null;
	}
	// Trigger a drag leave event to clear markers
	this.onDocumentDragLeave();
};

/**
 * Set the active table node
 *
 * @param {ve.ce.TableNode|null} tableNode Table node
 */
ve.ce.Surface.prototype.setActiveTableNode = function ( tableNode ) {
	this.activeTableNode = tableNode;
};

/**
 * Get the active table node
 *
 * @return {ve.ce.TableNode|null} Table node
 */
ve.ce.Surface.prototype.getActiveTableNode = function () {
	return this.activeTableNode;
};

/*! Utilities */

/**
 * Store a state snapshot at a keydown event, to be used in an after-keydown handler
 *
 * A ve.SelectionState object is stored, but only when the key event is a cursor key.
 * (It would be misleading to save selection properties for key events where the DOM might get
 * modified, because anchorNode/focusNode are live and mutable, and so the offsets may come to
 * point confusingly to different places than they did when the selection was saved).
 *
 * @param {jQuery.Event|null} e Key down event; must be active when this call is made
 */
ve.ce.Surface.prototype.storeKeyDownState = function ( e ) {
	this.keyDownState.event = e;
	this.keyDownState.selection = null;

	if ( this.nativeSelection.rangeCount > 0 && e && (
		e.keyCode === OO.ui.Keys.UP ||
		e.keyCode === OO.ui.Keys.DOWN ||
		e.keyCode === OO.ui.Keys.LEFT ||
		e.keyCode === OO.ui.Keys.RIGHT
	) ) {
		this.keyDownState.selection = new ve.SelectionState( this.nativeSelection );
	}
};

/**
 * Clear a stored state snapshot from a key down event
 */
ve.ce.Surface.prototype.clearKeyDownState = function () {
	this.keyDownState.event = null;
	this.keyDownState.selection = null;
};

/**
 * Move the DM surface cursor
 *
 * @param {number} offset Distance to move (negative = toward document start)
 */
ve.ce.Surface.prototype.moveModelCursor = function ( offset ) {
	var selection = this.model.getSelection();
	if ( selection instanceof ve.dm.LinearSelection ) {
		this.model.setLinearSelection( this.model.getDocument().getRelativeRange(
			selection.getRange(),
			offset,
			'character',
			false
		) );
	}
};

/**
 * Get the directionality at the current focused node
 *
 * @return {string} 'ltr' or 'rtl'
 */
ve.ce.Surface.prototype.getFocusedNodeDirectionality = function () {
	var cursorNode,
		range = this.model.getSelection().getRange();

	// Use stored directionality if we have one.
	if ( this.cursorDirectionality ) {
		return this.cursorDirectionality;
	}

	// Else fall back on the CSS directionality of the focused node at the DM selection focus,
	// which is less reliable because it does not take plaintext bidi into account.
	// (range.to will actually be at the edge of the focused node, but the
	// CSS directionality will be the same).
	cursorNode = this.getDocument().getNodeAndOffset( range.to ).node;
	if ( cursorNode.nodeType === Node.TEXT_NODE ) {
		cursorNode = cursorNode.parentNode;
	}
	return $( cursorNode ).css( 'direction' );
};

/**
 * Restore the selection from the model if it is outside the active table node
 *
 * This is only useful if the DOM selection and the model selection are out of sync.
 *
 * @return {boolean} Whether the selection was restored
 */
ve.ce.Surface.prototype.restoreActiveTableNodeSelection = function () {
	var activeTableNode, editingRange;
	if (
		( activeTableNode = this.getActiveTableNode() ) &&
		( editingRange = activeTableNode.getEditingRange() ) &&
		!editingRange.containsRange( ve.ce.veRangeFromSelection( this.nativeSelection ) )
	) {
		this.showModelSelection( this.getModel().getSelection() );
		return true;
	} else {
		return false;
	}
};

/**
 * Find a ce=false branch node that a native cursor movement from here *might* skip
 *
 * If a node is returned, then it might get skipped by a single native cursor
 * movement in the specified direction from the closest branch node at the
 * current cursor focus. However, if null is returned, then any single such
 * movement is guaranteed *not* to skip an uneditable branch node.
 *
 * Note we cannot predict precisely where/with which cursor key we might step out
 * of the current closest branch node, because it is difficult to predict the
 * behaviour of left/rightarrow (because of bidi visual cursoring) and
 * up/downarrow (because of wrapping).
 *
 * @param {number} direction -1 for before the cursor, +1 for after
 * @return {Node|null} Potentially cursor-adjacent uneditable branch node, or null
 */
ve.ce.Surface.prototype.findAdjacentUneditableBranchNode = function ( direction ) {
	var node,
		forward = direction > 0;

	node = $( this.nativeSelection.focusNode ).closest(
		'.ve-ce-branchNode,.ve-ce-leafNode,.ve-ce-surface-paste'
	)[ 0 ];
	if ( !node || node.classList.contains( 've-ce-surface-paste' ) ) {
		return null;
	}

	// Walk in document order till we find a ContentBranchNode (in which case
	// return null) or a FocusableNode/TableNode (in which case return the node)
	// or run out of nodes (in which case return null)
	while ( true ) {
		// Step up until we find a sibling
		while ( !( forward ? node.nextSibling : node.previousSibling ) ) {
			node = node.parentNode;
			if ( node === null ) {
				// Reached the document start/end
				return null;
			}
		}
		// Step back
		node = forward ? node.nextSibling : node.previousSibling;
		// Check and step down
		while ( true ) {
			if (
				$.data( node, 'view' ) instanceof ve.ce.ContentBranchNode ||
				// We shouldn't ever hit a raw text node, because they
				// should all be wrapped in CBNs or focusable nodes, but
				// just in case...
				node.nodeType === Node.TEXT_NODE
			) {
				// This is cursorable (must have content or slugs)
				return null;
			}
			if ( $( node ).is( '.ve-ce-focusableNode,.ve-ce-tableNode' ) ) {
				return node;
			}
			if ( !node.childNodes || node.childNodes.length === 0 ) {
				break;
			}
			node = forward ? node.firstChild : node.lastChild;
		}
	}
};

/**
 * Insert cursor holders, if they might be required as a cursor target
 */
ve.ce.Surface.prototype.updateCursorHolders = function () {
	var holderBefore = null,
		holderAfter = null,
		doc = this.getElementDocument(),
		nodeBefore = this.findAdjacentUneditableBranchNode( -1 ),
		nodeAfter = this.findAdjacentUneditableBranchNode( 1 );

	this.removeCursorHolders();

	if ( nodeBefore ) {
		holderBefore = doc.importNode( this.constructor.static.cursorHolderTemplate, true );
		holderBefore.classList.add( 've-ce-cursorHolder-after' );
		if ( ve.inputDebug ) {
			$( holderBefore ).css( {
				width: '2px',
				height: '2px',
				border: 'solid red 1px'
			} );
		}
		$( nodeBefore ).after( holderBefore );
	}
	if ( nodeAfter ) {
		holderAfter = doc.importNode( this.constructor.static.cursorHolderTemplate, true );
		holderAfter.classList.add( 've-ce-cursorHolder-before' );
		if ( ve.inputDebug ) {
			$( holderAfter ).css( {
				width: '2px',
				height: '2px',
				border: 'solid red 1px'
			} );
		}
		$( nodeAfter ).before( holderAfter );
	}
	this.cursorHolders = { before: holderBefore, after: holderAfter };
};

/**
 * Remove cursor holders, if they exist
 */
ve.ce.Surface.prototype.removeCursorHolders = function () {
	if ( !this.cursorHolders ) {
		return;
	}
	if ( this.cursorHolders.before ) {
		this.cursorHolders.before.parentNode.removeChild( this.cursorHolders.before );
	}
	if ( this.cursorHolders.after ) {
		this.cursorHolders.after.parentNode.removeChild( this.cursorHolders.after );
	}
	this.cursorHolders = null;
};

/**
 * Handle insertion of content.
 */
ve.ce.Surface.prototype.handleInsertion = function () {
	var range, cellSelection, hasChanged, selection, documentModel;

	// Don't allow a user to delete a focusable node just by typing
	if ( this.focusedNode ) {
		return;
	}

	hasChanged = false;
	selection = this.model.getSelection();
	documentModel = this.model.getDocument();

	if ( selection instanceof ve.dm.TableSelection ) {
		cellSelection = selection.collapseToFrom();
		this.model.setSelection( cellSelection );
		ve.ce.keyDownHandlerFactory.lookup( 'tableDelete' ).static.execute( this );
		this.documentView.getBranchNodeFromOffset( selection.tableRange.start + 1 ).setEditing( true );
		selection = this.model.getSelection();
	}

	if ( !( selection instanceof ve.dm.LinearSelection ) ) {
		return;
	}

	range = selection.getRange();

	// Handles removing expanded selection before inserting new text
	if (
		this.selectionSplitsLink() ||
		( !range.isCollapsed() && !this.documentView.rangeInsideOneLeafNode( range ) )
	) {
		// Remove the selection to force its re-application from the DM (even if the
		// DM is too granular to detect the selection change)
		this.model.setNullSelection();
		this.model.change(
			ve.dm.Transaction.newFromRemoval(
				this.documentView.model,
				range
			),
			new ve.dm.LinearSelection( documentModel, new ve.Range( range.start ) )
		);
		hasChanged = true;
		this.surfaceObserver.clear();
		this.storeKeyDownState( this.keyDownState.event );
		this.surfaceObserver.stopTimerLoop();
		this.surfaceObserver.pollOnce();
	}
};

/**
 * Get an approximate range covering data visible in the viewport
 *
 * It is assumed that vertical offset increases as you progress through the DM.
 * Items with custom positioning may throw off results given by this method, so
 * it should only be treated as an approximation.
 *
 * @return {ve.Range} Range covering data visible in the viewport
 */
ve.ce.Surface.prototype.getViewportRange = function () {
	var surface = this,
		documentModel = this.getModel().getDocument(),
		data = documentModel.data,
		surfaceRect = this.getSurface().getBoundingClientRect(),
		padding = 50,
		top = Math.max( this.surface.toolbarHeight - surfaceRect.top - padding, 0 ),
		bottom = top + this.$window.height() - this.surface.toolbarHeight + ( padding * 2 ),
		documentRange = new ve.Range( 0, this.getModel().getDocument().getInternalList().getListNode().getOuterRange().start );

	function highestIgnoreChildrenNode( childNode ) {
		var ignoreChildrenNode = null;
		childNode.traverseUpstream( function ( node ) {
			if ( node.shouldIgnoreChildren() ) {
				ignoreChildrenNode = node;
			}
		} );
		return ignoreChildrenNode;
	}

	function binarySearch( offset, range, side ) {
		var mid, rect, midNode, ignoreChildrenNode, nodeRange,
			start = range.start,
			end = range.end,
			lastLength = Infinity;
		while ( range.getLength() < lastLength ) {
			lastLength = range.getLength();
			mid = Math.round( ( range.start + range.end ) / 2 );
			midNode = documentModel.documentNode.getNodeFromOffset( mid );
			ignoreChildrenNode = highestIgnoreChildrenNode( midNode );

			if ( ignoreChildrenNode ) {
				nodeRange = ignoreChildrenNode.getOuterRange();
				mid = side === 'top' ? nodeRange.end : nodeRange.start;
			} else {
				mid = data.getNearestContentOffset( mid );
			}

			rect = surface.getSelectionBoundingRect( new ve.dm.LinearSelection( documentModel, new ve.Range( mid ) ) );
			if ( rect[ side ] > offset ) {
				end = mid;
				range = new ve.Range( range.start, end );
			} else {
				start = mid;
				range = new ve.Range( start, range.end );
			}
		}
		return side === 'bottom' ? start : end;
	}

	return new ve.Range(
		binarySearch( top, documentRange, 'bottom' ),
		binarySearch( bottom, documentRange, 'top' )
	);
};

/**
 * Apply a DM selection to the DOM
 *
 * @method
 * @param {ve.dm.Selection} selection Selection to show
 * @return {boolean} Whether the selection actually changed
 */
ve.ce.Surface.prototype.showModelSelection = function ( selection ) {
	if ( this.deactivated ) {
		// Defer until view has updated
		setTimeout( this.updateDeactivatedSelection.bind( this ) );
		return false;
	}

	if (
		!( selection instanceof ve.dm.LinearSelection ) ||
		this.focusedNode ||
		this.focusedBlockSlug
	) {
		return false;
	}

	return this.showSelectionState( this.getSelectionState( selection.getRange() ) );
};

/**
 * Apply a selection state to the DOM
 *
 * If the browser cannot show a backward selection, fall back to the forward equivalent
 *
 * @param {ve.SelectionState} selection The selection state to show
 * @return {boolean} Whether the selection actually changed
 */
ve.ce.Surface.prototype.showSelectionState = function ( selection ) {
	var range,
		$focusTarget,
		extendedBackwards = false,
		sel = this.nativeSelection,
		newSel = selection;

	if ( newSel.equalsSelection( sel ) ) {
		this.updateActiveLink();
		return false;
	}

	if ( newSel.isBackwards ) {
		if ( sel.extend ) {
			// Set the range at the anchor, and extend backwards to the focus
			range = this.getElementDocument().createRange();
			range.setStart( newSel.anchorNode, newSel.anchorOffset );
			sel.removeAllRanges();
			sel.addRange( range );
			try {
				sel.extend( newSel.focusNode, newSel.focusOffset );
				extendedBackwards = true;
			} catch ( e ) {
				// Firefox sometimes fails when nodes are different
				// see https://bugzilla.mozilla.org/show_bug.cgi?id=921444
			}
		}
		if ( !extendedBackwards ) {
			// Fallback: Apply the corresponding forward selection
			newSel = newSel.flip();
			if ( newSel.equalsSelection( sel ) ) {
				this.updateActiveLink();
				return false;
			}
		}
	}

	if ( !extendedBackwards ) {
		// Forward selection
		sel.removeAllRanges();
		sel.addRange( newSel.getNativeRange( this.getElementDocument() ) );
	}

	// Setting a range doesn't give focus in all browsers so make sure this happens
	// Also set focus after range to prevent scrolling to top
	$focusTarget = $( newSel.focusNode ).closest( '[contenteditable=true]' );
	if ( !OO.ui.contains( $focusTarget.get( 0 ), this.getElementDocument().activeElement, true ) ) {
		$focusTarget.focus();
	} else {
		// Scroll the node into view
		ve.scrollIntoView(
			$( newSel.focusNode ).closest( '*' ).get( 0 )
		);
	}
	this.updateActiveLink();
	return true;
};

/**
 * Update the activeLink property and apply CSS classes accordingly
 */
ve.ce.Surface.prototype.updateActiveLink = function () {
	var activeLink = this.linkAnnotationAtFocus();
	if ( activeLink === this.activeLink ) {
		return;
	}
	if ( this.activeLink ) {
		this.activeLink.classList.remove( 've-ce-linkAnnotation-active' );
	}
	this.activeLink = activeLink;
	if ( activeLink ) {
		this.activeLink.classList.add( 've-ce-linkAnnotation-active' );
	}
	this.model.emit( 'contextChange' );
};

/**
 * Get the linkAnnotation node containing the cursor fous
 *
 * If there is no focus, or it is not inside a linkAnnotation, return null
 *
 * @return {Node|null} the linkAnnotation node containing the focus
 *
 */
ve.ce.Surface.prototype.linkAnnotationAtFocus = function () {
	return $( this.nativeSelection.focusNode ).closest( '.ve-ce-linkAnnotation' )[ 0 ] || null;
};

/**
 * Get a SelectionState corresponding to a ve.Range.
 *
 * @method
 * @param {ve.Range} range Range to get selection for
 * @return {Object} The selection
 * @return {Node} return.anchorNode The anchor node
 * @return {number} return.anchorOffset The anchor offset
 * @return {Node} return.focusNode The focus node
 * @return {number} return.focusOffset The focus offset
 * @return {boolean} return.isCollapsed True if the focus and anchor are in the same place
 * @return {boolean} return.isBackwards True if the focus is before the anchor
 */
ve.ce.Surface.prototype.getSelectionState = function ( range ) {
	var anchor, focus,
		dmDoc = this.getModel().getDocument();

	// Anchor/focus at the nearest correct position in the direction that grows the selection
	anchor = this.documentView.getNodeAndOffset(
		dmDoc.getNearestCursorOffset( range.from, range.isBackwards() ? 1 : -1 )
	);
	focus = this.documentView.getNodeAndOffset(
		dmDoc.getNearestCursorOffset( range.to, range.isBackwards() ? -1 : 1 )
	);
	return new ve.SelectionState( {
		anchorNode: anchor.node,
		anchorOffset: anchor.offset,
		focusNode: focus.node,
		focusOffset: focus.offset,
		isBackwards: range.isBackwards()
	} );
};

/**
 * Get a native range object for a specified ve.Range
 *
 * Native ranges are only used by linear selections. They don't show whether the selection
 * is backwards, so they should be used for measurement only.
 *
 * @param {ve.Range} [range] Optional range to get the native range for, defaults to current selection's range
 * @return {Range|null} Native range object, or null if there is no suitable selection
 */
ve.ce.Surface.prototype.getNativeRange = function ( range ) {
	var selectionState, modelSelection;

	if ( !range || (
		!this.deactivated &&
		( modelSelection = this.getModel().getSelection() ) instanceof ve.dm.LinearSelection &&
		modelSelection.getRange().equalsSelection( range )
	) ) {
		// If no range specified, or range is equivalent to current native selection,
		// then use the current native selection
		selectionState = new ve.SelectionState( this.nativeSelection );
	} else {
		selectionState = this.getSelectionState( range );
	}
	return selectionState.getNativeRange( this.getElementDocument() );
};

/**
 * Append passed highlights to highlight container.
 *
 * @method
 * @param {jQuery} $highlights Highlights to append
 * @param {boolean} focused Highlights are currently focused
 */
ve.ce.Surface.prototype.appendHighlights = function ( $highlights, focused ) {
	// Only one item can be blurred-highlighted at a time, so remove the others.
	// Remove by detaching so they don't lose their event handlers, in case they
	// are attached again.
	this.$highlightsBlurred.children().detach();
	if ( focused ) {
		this.$highlightsFocused.append( $highlights );
	} else {
		this.$highlightsBlurred.append( $highlights );
	}
};

/*! Getters */

/**
 * Get the top-level surface.
 *
 * @method
 * @return {ve.ui.Surface} Surface
 */
ve.ce.Surface.prototype.getSurface = function () {
	return this.surface;
};

/**
 * Get the surface model.
 *
 * @method
 * @return {ve.dm.Surface} Surface model
 */
ve.ce.Surface.prototype.getModel = function () {
	return this.model;
};

/**
 * Get the document view.
 *
 * @method
 * @return {ve.ce.Document} Document view
 */
ve.ce.Surface.prototype.getDocument = function () {
	return this.documentView;
};

/**
 * Check whether there are any render locks
 *
 * @method
 * @return {boolean} Render is locked
 */
ve.ce.Surface.prototype.isRenderingLocked = function () {
	return this.renderLocks > 0;
};

/**
 * Add a single render lock (to disable rendering)
 *
 * @method
 */
ve.ce.Surface.prototype.incRenderLock = function () {
	this.renderLocks++;
};

/**
 * Remove a single render lock
 *
 * @method
 */
ve.ce.Surface.prototype.decRenderLock = function () {
	this.renderLocks--;
};

/**
 * Change the model only, not the CE surface
 *
 * This avoids event storms when the CE surface is already correct
 *
 * @method
 * @param {ve.dm.Transaction|ve.dm.Transaction[]|null} transactions One or more transactions to
 * process, or null to process none
 * @param {ve.dm.Selection} selection New selection
 * @throws {Error} If calls to this method are nested
 */
ve.ce.Surface.prototype.changeModel = function ( transactions, selection ) {
	if ( this.newModelSelection !== null ) {
		throw new Error( 'Nested change of newModelSelection' );
	}
	this.newModelSelection = selection;
	try {
		this.model.change( transactions, selection );
	} finally {
		this.newModelSelection = null;
	}
};

/**
 * Inform the surface that one of its ContentBranchNodes' rendering has changed.
 *
 * @see ve.ce.ContentBranchNode#renderContents
 */
ve.ce.Surface.prototype.setContentBranchNodeChanged = function () {
	this.contentBranchNodeChanged = true;
	this.clearKeyDownState();
};

/**
 * Set the node that has the current unicorn.
 *
 * If another node currently has a unicorn, it will be rerendered, which will
 * cause it to release its unicorn.
 *
 * @param {ve.ce.ContentBranchNode} node The node claiming the unicorn
 */
ve.ce.Surface.prototype.setUnicorning = function ( node ) {
	if ( this.setUnicorningRecursionGuard ) {
		throw new Error( 'setUnicorning recursing' );
	}
	if ( this.unicorningNode && this.unicorningNode !== node ) {
		this.setUnicorningRecursionGuard = true;
		try {
			this.unicorningNode.renderContents();
		} finally {
			this.setUnicorningRecursionGuard = false;
		}
	}
	this.unicorningNode = node;
};

/**
 * Release the current unicorn held by a given node.
 *
 * If the node doesn't hold the current unicorn, nothing happens.
 * This function does not cause any node to be rerendered.
 *
 * @param {ve.ce.ContentBranchNode} node The node releasing the unicorn
 */
ve.ce.Surface.prototype.setNotUnicorning = function ( node ) {
	if ( this.unicorningNode === node ) {
		this.unicorningNode = null;
	}
};

/**
 * Ensure that no node has a unicorn.
 *
 * If the given node currently has the unicorn, it will be released and
 * no rerender will happen. If another node has the unicorn, that node
 * will be rerendered to get rid of the unicorn.
 *
 * @param {ve.ce.ContentBranchNode} node The node releasing the unicorn
 */
ve.ce.Surface.prototype.setNotUnicorningAll = function ( node ) {
	if ( this.unicorningNode === node ) {
		// Don't call back node.renderContents()
		this.unicorningNode = null;
	}
	this.setUnicorning( null );
};

/**
 * Get list of selected nodes and annotations.
 *
 * Exclude link annotations unless the CE focus is inside a link
 *
 * @param {boolean} [all] Include nodes and annotations which only cover some of the fragment
 * @return {ve.dm.Model[]} Selected models
 */
ve.ce.Surface.prototype.getSelectedModels = function () {
	var models, fragmentAfter;
	if ( !( this.model.selection instanceof ve.dm.LinearSelection ) ) {
		return [];
	}
	models = this.model.getFragment().getSelectedModels();

	if ( this.model.selection.isCollapsed() ) {
		fragmentAfter = this.model.getFragment( new ve.dm.LinearSelection(
			this.model.getDocument(),
			new ve.Range(
				this.model.selection.range.start,
				this.model.selection.range.start + 1
			)
		) );
		models = OO.unique( [].concat(
			models,
			fragmentAfter.getSelectedModels()
		) );
	}

	if ( this.activeLink ) {
		return models;
	}
	return models.filter( function ( annModel ) {
		return !( annModel instanceof ve.dm.LinkAnnotation );
	} );
};

/**
 * Tests whether the selection covers part but not all of a link
 *
 * @return {boolean} True if a link is split either at the focus or at the anchor (or both)
 */
ve.ce.Surface.prototype.selectionSplitsLink = function () {
	return ve.ce.linkAt( this.nativeSelection.anchorNode ) !==
		ve.ce.linkAt( this.nativeSelection.focusNode );
};
