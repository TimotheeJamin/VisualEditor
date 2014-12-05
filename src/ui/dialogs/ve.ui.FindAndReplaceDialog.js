/*!
 * VisualEditor UserInterface FindAndReplaceDialog class.
 *
 * @copyright 2011-2014 VisualEditor Team and others; see http://ve.mit-license.org
 */

/**
 * Find and replace dialog.
 *
 * @class
 * @extends ve.ui.ToolbarDialog
 *
 * @constructor
 * @param {Object} [config] Configuration options
 */
ve.ui.FindAndReplaceDialog = function VeUiFindAndReplaceDialog( config ) {
	// Parent constructor
	ve.ui.FindAndReplaceDialog.super.call( this, config );

	// Properties
	this.surface = null;

	// Pre-initialization
	this.$element.addClass( 've-ui-findAndReplaceDialog' );
};

/* Inheritance */

OO.inheritClass( ve.ui.FindAndReplaceDialog, ve.ui.ToolbarDialog );

ve.ui.FindAndReplaceDialog.static.name = 'findAndReplace';

ve.ui.FindAndReplaceDialog.static.title = OO.ui.deferMsg( 'visualeditor-find-and-replace-title' );

/* Methods */

/**
 * @inheritdoc
 */
ve.ui.FindAndReplaceDialog.prototype.initialize = function () {
	// Parent method
	ve.ui.FindAndReplaceDialog.super.prototype.initialize.call( this );

	this.$findResults = this.$( '<div>' ).addClass( 've-ui-findAndReplaceDialog-findResults' );
	this.fragments = [];
	this.replacing = false;
	this.focusedIndex = 0;
	this.findText = new OO.ui.TextInputWidget( {
		$: this.$,
		classes: ['ve-ui-findAndReplaceDialog-cell', 've-ui-findAndReplaceDialog-findText'],
		placeholder: ve.msg( 'visualeditor-find-and-replace-find-text' )
	} );
	this.matchCaseToggle = new OO.ui.ToggleSwitchWidget( { $: this.$ } );
	this.focusedIndexLabel = new OO.ui.LabelWidget( {
		$: this.$,
		classes: ['ve-ui-findAndReplaceDialog-focusedIndexLabel']
	} );
	this.previousButton = new OO.ui.ButtonWidget( {
		$: this.$,
		icon: 'previous'
	} );
	this.nextButton = new OO.ui.ButtonWidget( {
		$: this.$,
		icon: 'next'
	} );
	this.replaceText = new OO.ui.TextInputWidget( {
		$: this.$,
		classes: ['ve-ui-findAndReplaceDialog-cell'],
		placeholder: ve.msg( 'visualeditor-find-and-replace-replace-text' )
	} );
	this.replaceButton = new OO.ui.ButtonWidget( {
		$: this.$,
		label: ve.msg( 'visualeditor-find-and-replace-replace-button' )
	} );
	this.replaceAllButton = new OO.ui.ButtonWidget( {
		$: this.$,
		label: ve.msg( 'visualeditor-find-and-replace-replace-all-button' )
	} );

	var checkboxField = new OO.ui.FieldLayout(
			this.matchCaseToggle,
			{
				$: this.$,
				classes: ['ve-ui-findAndReplaceDialog-cell'],
				align: 'inline',
				label: ve.msg( 'visualeditor-find-and-replace-match-case' )
			}
		),
		navigateGroup = new OO.ui.ButtonGroupWidget( {
			$: this.$,
			classes: ['ve-ui-findAndReplaceDialog-cell'],
			items: [
				this.previousButton,
				this.nextButton
			]
		} ),
		replaceGroup = new OO.ui.ButtonGroupWidget( {
			$: this.$,
			classes: ['ve-ui-findAndReplaceDialog-cell'],
			items: [
				this.replaceButton,
				this.replaceAllButton
			]
		} ),
		$findRow = this.$( '<div>' ).addClass( 've-ui-findAndReplaceDialog-row' ),
		$replaceRow = this.$( '<div>' ).addClass( 've-ui-findAndReplaceDialog-row' );

	// Events
	this.updateFragmentsDebounced = ve.debounce( this.updateFragments.bind( this ) );
	this.positionResultsDebounced = ve.debounce( this.positionResults.bind( this ) );
	this.findText.connect( this, {
		change: 'onFindChange',
		enter: 'onFindTextEnter'
	} );
	this.matchCaseToggle.connect( this, { change: 'onFindChange' } );
	this.nextButton.connect( this, { click: 'onNextButtonClick' } );
	this.previousButton.connect( this, { click: 'onPreviousButtonClick' } );
	this.replaceButton.connect( this, { click: 'onReplaceButtonClick' } );
	this.replaceAllButton.connect( this, { click: 'onReplaceAllButtonClick' } );
	this.$content.on( 'keydown', this.onContentKeyDown.bind( this ) );

	// Initialization
	this.findText.$input.attr( 'tabIndex', 1 );
	this.replaceText.$input.attr( 'tabIndex', 2 );
	this.$content.addClass( 've-ui-findAndReplaceDialog-content' );
	this.$body
		.append(
			$findRow.append(
				this.findText.$element.append(
					this.focusedIndexLabel.$element
				),
				navigateGroup.$element,
				checkboxField.$element
			),
			$replaceRow.append(
				this.replaceText.$element,
				replaceGroup.$element
			)
		);
};

/**
 * @inheritdoc
 */
ve.ui.FindAndReplaceDialog.prototype.getSetupProcess = function ( data ) {
	data = data || {};
	return ve.ui.FindAndReplaceDialog.super.prototype.getSetupProcess.call( this, data )
		.first( function () {
			this.surface = data.surface;
			this.surface.$controls.append( this.$findResults );
			this.surface.getModel().connect( this, { documentUpdate: this.updateFragmentsDebounced } );
			this.surface.getView().connect( this, { position: this.positionResultsDebounced } );

			var text = data.fragment.getText();
			if ( text ) {
				this.findText.setValue( text );
			} else {
				this.updateFragments();
			}
		}, this );
};

/**
 * @inheritdoc
 */
ve.ui.FindAndReplaceDialog.prototype.getReadyProcess = function ( data ) {
	return ve.ui.FindAndReplaceDialog.super.prototype.getReadyProcess.call( this, data )
		.next( function () {
			this.findText.focus().select();
		}, this );
};

/**
 * @inheritdoc
 */
ve.ui.FindAndReplaceDialog.prototype.getTeardownProcess = function ( data ) {
	return ve.ui.FindAndReplaceDialog.super.prototype.getTeardownProcess.call( this, data )
		.next( function () {
			var surfaceView = this.surface.getView();
			this.surface.getModel().disconnect( this );
			surfaceView.disconnect( this );
			surfaceView.focus();
			this.$findResults.empty().detach();
			this.fragment = [];
			this.surface = null;
		}, this );
};

/**
 * Handle keydown events inside the dialog
 */
ve.ui.FindAndReplaceDialog.prototype.onContentKeyDown = function ( e ) {
	var command, trigger = new ve.ui.Trigger( e );
	if ( trigger.isComplete() ) {
		command = this.surface.getCommandByTrigger( trigger.toString() );
		if ( command && command.getName() === 'findAndReplace' ) {
			e.preventDefault();
			this.close();
		}
	}
};

/**
 * Handle change events to the find inputs (text or match case)
 */
ve.ui.FindAndReplaceDialog.prototype.onFindChange = function () {
	this.updateFragments();
	this.positionResults();
	this.highlightFocused( true );
};

/**
 * Handle enter events on the find text input
 *
 * @param {jQuery.Event} e
 */
ve.ui.FindAndReplaceDialog.prototype.onFindTextEnter = function ( e ) {
	if ( !this.fragments.length ) {
		return;
	}
	if ( e.shiftKey ) {
		this.onPreviousButtonClick();
	} else {
		this.onNextButtonClick();
	}
};

/**
 * Update search result fragments
 */
ve.ui.FindAndReplaceDialog.prototype.updateFragments = function () {
	var i, l, findLen,
		endOffset = 0,
		surfaceModel = this.surface.getModel(),
		documentModel = surfaceModel.getDocument(),
		offsets = [],
		matchCase = this.matchCaseToggle.getValue(),
		find = this.findText.getValue();

	this.fragments = [];
	if ( find ) {
		offsets = documentModel.findText( find, matchCase, true );
		findLen = find.length;
		for ( i = 0, l = offsets.length; i < l; i++ ) {
			endOffset = offsets[i] + findLen;
			this.fragments.push( surfaceModel.getLinearFragment( new ve.Range( offsets[i], endOffset ), true, true ) );
		}
	}
	this.focusedIndex = Math.min( this.focusedIndex, this.fragments.length );
	this.nextButton.setDisabled( !this.fragments.length );
	this.previousButton.setDisabled( !this.fragments.length );
	this.replaceButton.setDisabled( !this.fragments.length );
	this.replaceAllButton.setDisabled( !this.fragments.length );
};

/**
 * Position results markers
 */
ve.ui.FindAndReplaceDialog.prototype.positionResults = function () {
	if ( this.replacing ) {
		return;
	}

	var i, l, j, rects, $result, top;

	this.$findResults.empty();
	for ( i = 0, l = this.fragments.length; i < l; i++ ) {
		rects = this.surface.getView().getSelectionRects( this.fragments[i].getSelection() );
		$result = this.$( '<div>' ).addClass( 've-ui-findAndReplaceDialog-findResult' );
		top = Infinity;
		for ( j in rects ) {
			top = Math.min( top, rects[j].top );
			$result.append( this.$( '<div>' ).css( rects[j] ) );
		}
		$result.data( 'top', top );
		this.$findResults.append( $result );
	}
	this.highlightFocused();
};

/**
 * Highlight the focused result marker
 *
 * @param {boolean} scrollIntoView Scroll the marker into view
 */
ve.ui.FindAndReplaceDialog.prototype.highlightFocused = function ( scrollIntoView ) {
	var windowScrollTop, windowScrollHeight, offset,
		surfaceView = this.surface.getView(),
		$result = this.$findResults.children().eq( this.focusedIndex );

	this.$findResults
		.find( '.ve-ui-findAndReplaceDialog-findResult-focused' )
		.removeClass( 've-ui-findAndReplaceDialog-findResult-focused' );
	$result.addClass( 've-ui-findAndReplaceDialog-findResult-focused' );

	if ( this.fragments.length ) {
		this.focusedIndexLabel.setLabel(
			ve.msg( 'visualeditor-find-and-replace-results', this.focusedIndex + 1, this.fragments.length )
		);
	} else {
		this.focusedIndexLabel.setLabel( '' );
	}

	if ( scrollIntoView ) {
		offset = $result.data( 'top' ) + surfaceView.$element.offset().top;
		windowScrollTop = surfaceView.$window.scrollTop() + this.surface.toolbarHeight;
		windowScrollHeight = surfaceView.$window.height() - this.surface.toolbarHeight;
		if ( offset < windowScrollTop || offset > windowScrollTop + windowScrollHeight ) {
			surfaceView.$( 'body, html' ).animate( { scrollTop: offset - ( windowScrollHeight / 2  ) }, 'fast' );
		}
	}
};

/**
 * Handle click events on the next button
 */
ve.ui.FindAndReplaceDialog.prototype.onNextButtonClick = function () {
	this.focusedIndex = ( this.focusedIndex + 1 ) % this.fragments.length;
	this.highlightFocused( true );
};

/**
 * Handle click events on the previous button
 */
ve.ui.FindAndReplaceDialog.prototype.onPreviousButtonClick = function () {
	this.focusedIndex = ( this.focusedIndex + this.fragments.length - 1 ) % this.fragments.length;
	this.highlightFocused( true );
};

/**
 * Handle click events on the replace button
 */
ve.ui.FindAndReplaceDialog.prototype.onReplaceButtonClick = function () {
	var end, replace = this.replaceText.getValue();

	if ( !this.fragments.length ) {
		return;
	}

	this.fragments[this.focusedIndex].insertContent( replace, true );

	// Find the next fragment after this one ends. Ensures that if we replace
	// 'foo' with 'foofoo' we don't select the just-inserted text.
	end = this.fragments[this.focusedIndex].getSelection().getRange().end;
	// updateFragmentsDebounced is triggered by insertContent, but call it immediately
	// so we can find the next fragment to select.
	this.updateFragments();
	if ( !this.fragments.length ) {
		this.focusedIndex = 0;
		return;
	}
	while ( this.fragments[this.focusedIndex] && this.fragments[this.focusedIndex].getSelection().getRange().end <= end ) {
		this.focusedIndex++;
	}
	// We may have iterated off the end
	this.focusedIndex = this.focusedIndex % this.fragments.length;
};

/**
 * Handle click events on the previous all button
 */
ve.ui.FindAndReplaceDialog.prototype.onReplaceAllButtonClick = function () {
	var i, l,
		replace = this.replaceText.getValue();

	for ( i = 0, l = this.fragments.length; i < l; i++ ) {
		this.fragments[i].insertContent( replace, true );
	}
};

/* Registration */

ve.ui.windowFactory.register( ve.ui.FindAndReplaceDialog );
