/*!
 * VisualEditor DataModel Converter tests.
 *
 * @copyright 2011-2020 VisualEditor Team and others; see http://ve.mit-license.org
 */

QUnit.module( 've.dm.Converter' );

/* Tests */

QUnit.test( 'getModelFromDom', function ( assert ) {
	var msg, cases = ve.dm.example.domToDataCases;

	for ( msg in cases ) {
		ve.test.utils.runGetModelFromDomTest( assert, ve.copy( cases[ msg ] ), msg );
	}
} );

QUnit.test( 'getModelFromDom with store argument', function ( assert ) {
	var model,
		store = new ve.dm.HashValueStore();
	model = ve.dm.converter.getModelFromDom(
		ve.createDocumentFromHtml( '<p>foo</p>' ),
		{ lang: 'en', dir: 'ltr' },
		store
	);
	// eslint-disable-next-line qunit/no-ok-equality
	assert.ok( model.getStore() === store, 'Document store is reference-equal to store argument' );
} );

QUnit.test( 'getDomFromModel', function ( assert ) {
	var msg, cases = ve.dm.example.domToDataCases;

	for ( msg in cases ) {
		ve.test.utils.runGetDomFromModelTest( assert, ve.copy( cases[ msg ] ), msg );
	}
} );

QUnit.test( 'getFullData', function ( assert ) {
	var cases = [
		{
			msg: 'Metadata in ContentBranchNode gets moved outside by any change',
			beforeHtml: '<p>x</p><!-- w --><meta foo="x"><p>ab<meta foo="y">cd</p><p>ef<meta foo="z">gh</p>',
			transaction: function ( doc ) {
				return ve.dm.TransactionBuilder.static.newFromRemoval( doc, new ve.Range( 13, 14 ) );
			},
			afterHtml: '<p>x</p><!-- w --><meta foo="x"><p>abc</p><meta foo="y"><p>ef<meta foo="z">gh</p>'
		},
		{
			msg: 'Metadata in ContentBranchNode is NOT removed when the whole node is removed',
			beforeHtml: '<p>x</p><!-- w --><meta foo="x"><p>ab<meta foo="y">cd</p><p>ef<meta foo="z">gh</p>',
			transaction: function ( doc ) {
				return ve.dm.TransactionBuilder.static.newFromRemoval( doc, new ve.Range( 7, 15 ) );
			},
			afterHtml: '<p>x</p><!-- w --><meta foo="x"><meta foo="y"><p>ef<meta foo="z">gh</p>',
			// BUG! <meta foo="y"> is not restored to the correct place after undoing
			// EXPECTED: Same as beforeHtml
			beforeHtmlUndo: '<p>x</p><!-- w --><meta foo="x"><p>abcd</p><meta foo="y"><p>ef<meta foo="z">gh</p>'
		},
		{
			msg: 'Removable metadata (empty annotation) in ContentBranchNode is removed by any change',
			beforeHtml: '<p>x</p><p>ab<i></i>cd</p><p>efgh</p>',
			transaction: function ( doc ) {
				return ve.dm.TransactionBuilder.static.newFromRemoval( doc, new ve.Range( 7, 8 ) );
			},
			afterHtml: '<p>x</p><p>abc</p><p>efgh</p>'
		},
		{
			msg: 'Removable metadata (empty annotation) in ContentBranchNode is removed when the whole node is removed',
			beforeHtml: '<p>x</p><p>ab<i></i>cd</p><p>efgh</p>',
			transaction: function ( doc ) {
				return ve.dm.TransactionBuilder.static.newFromRemoval( doc, new ve.Range( 3, 9 ) );
			},
			// BUG! <i></i> is not removed
			// EXPECTED: '<p>x</p><p>efgh</p>'
			afterHtml: '<p>x</p><i></i><p>efgh</p>',
			// BUG! <i></i> is not restored
			// EXPECTED: Same as beforeHtml
			beforeHtmlUndo: '<p>x</p><p>abcd</p><p>efgh</p>'
		}
	];

	cases.forEach( function ( caseItem ) {
		var doc = ve.dm.converter.getModelFromDom( ve.createDocumentFromHtml( caseItem.beforeHtml ) ),
			tx = caseItem.transaction( doc );

		doc.commit( tx );
		assert.strictEqual(
			ve.dm.converter.getDomFromModel( doc ).body.innerHTML,
			caseItem.afterHtml,
			caseItem.msg
		);

		doc.commit( tx.reversed() );
		assert.strictEqual(
			ve.dm.converter.getDomFromModel( doc ).body.innerHTML,
			caseItem.beforeHtmlUndo || caseItem.beforeHtml,
			caseItem.msg + ' (undo)'
		);
	} );
} );

QUnit.test( 'roundTripMetadata', function ( assert ) {
	var doc, tx,
		beforeHtml = '<!-- w --><meta foo="x"><p>ab<meta foo="y">cd</p><p>ef<meta foo="z">gh</p>',
		afterHtml = '<!-- w --><meta foo="x"><p>abc</p><meta foo="y"><p>ef<meta foo="z">gh</p>';

	doc = ve.dm.converter.getModelFromDom( ve.createDocumentFromHtml( beforeHtml ) );
	tx = ve.dm.TransactionBuilder.static.newFromRemoval( doc, new ve.Range( 10, 11 ) );
	doc.commit( tx );
	assert.strictEqual(
		ve.dm.converter.getDomFromModel( doc ).body.innerHTML,
		afterHtml,
		'Metadata in ContentBranchNode gets moved outside by change to ContentBranchNode'
	);
	doc.commit( tx.reversed() );
	assert.strictEqual(
		ve.dm.converter.getDomFromModel( doc ).body.innerHTML,
		beforeHtml,
		'Undo restores metadata to inside ContentBranchNode'
	);
} );
