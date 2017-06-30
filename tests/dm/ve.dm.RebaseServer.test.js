/*!
 * VisualEditor DataModel Rebase client/server logic tests.
 *
 * @copyright 2011-2017 VisualEditor Team and others; see http://ve.mit-license.org
 */

QUnit.module( 've.dm.RebaseServer' );

QUnit.test( 'Rebase', function ( assert ) {
	var i, j, op, server, client, clients, action, txs,
		cases = [
			{
				name: 'Concurrent insertions',
				initialData: [ { type: 'paragraph' }, { type: '/paragraph' } ],
				clients: [ '1', '2' ],
				ops: [
					// Client 1 submits abc
					[ '1', 'apply', [
						[ 'insert', 1, [ 'a' ], 3 ],
						[ 'insert', 2, [ 'b' ], 3 ],
						[ 'insert', 3, [ 'c' ], 3 ]
					] ],
					// Client getHistorySummary() output looks like: confirmed/sent?/unsent!
					// Obviously, the server only has confirmed items
					[ '1', 'assertHist', 'abc!' ],
					[ '1', 'submit' ],
					[ '1', 'assertHist', 'abc?' ],
					[ '1', 'deliver' ],
					[ 'server', 'assertHist', 'abc' ],

					// Client 2 submits AB
					[ '2', 'apply', [
						[ 'insert', 1, [ 'A' ], 3 ],
						[ 'insert', 2, [ 'B' ], 3 ]
					] ],
					[ '2', 'assertHist', 'AB!' ],
					[ '2', 'submit' ],
					[ '2', 'deliver' ],
					// Server puts client 2's insertion after client 1's
					[ 'server', 'assertHist', 'abcAB' ],

					// Client 1 inserts bolded def
					[ '1', 'apply', [
						[ 'insert', 4, [ 'd', 'e', 'f' ], 3 ]
					] ],
					[ '1', 'assertHist', 'abc?/def!' ],
					// Client 1 receives confirmation of abc
					[ '1', 'receive' ],
					[ '1', 'assertHist', 'abc/def!' ],
					// Client 1 submits def
					[ '1', 'submit' ],
					[ '1', 'assertHist', 'abc/def?' ],
					[ '1', 'deliver' ],
					// The summary order shows that def arrived after AB in the
					// history (even though it lies before AB in document order)
					[ 'server', 'assertHist', 'abcABdef' ],

					// Client 2 inserts underlined CD
					[ '2', 'apply', [
						[ 'insert', 3, [ 'C', 'D' ], 3 ]
					] ],
					[ '2', 'assertHist', 'AB?/CD!' ],
					// Client 2 receives abc and rebases over it
					[ '2', 'receive' ],
					[ '2', 'assertHist', 'abc/AB?/CD!' ],
					// Client 2 receives confirmation of AB
					[ '2', 'receive' ],
					[ '2', 'assertHist', 'abcAB/CD!' ],
					// Client 2 submits CD
					[ '2', 'submit' ],
					[ '2', 'assertHist', 'abcAB/CD?' ],
					[ '2', 'deliver' ],
					[ 'server', 'assertHist', 'abcABdefCD' ],

					// Client 1 receives AB, rebases def over it
					[ '1', 'receive' ],
					[ '1', 'assertHist', 'abcAB/def?' ],
					// Client 1 receives confirmation of def
					[ '1', 'receive' ],
					[ '1', 'assertHist', 'abcABdef' ],

					// Client 1 submits ghi
					[ '1', 'apply', [
						[ 'insert', 9, [ 'g', 'h', 'i' ], 3 ]
					] ],
					[ '1', 'assertHist', 'abcABdef/ghi!' ],
					[ '1', 'submit' ],
					[ '1', 'assertHist', 'abcABdef/ghi?' ],
					[ '1', 'deliver' ],
					[ 'server', 'assertHist', 'abcABdefCDghi' ],
					// Client 1 receives CD, rebases ghi over it
					[ '1', 'receive' ],
					[ '1', 'assertHist', 'abcABdefCD/ghi?' ],
					// Client 1 receives confirmation of ghi
					[ '1', 'receive' ],
					[ '1', 'assertHist', 'abcABdefCDghi' ],

					// Client 2 catches up
					[ '2', 'receive' ],
					[ '2', 'assertHist', 'abcABdef/CD?' ],
					[ '2', 'receive' ],
					[ '2', 'assertHist', 'abcABdefCD' ],
					[ '2', 'receive' ],
					[ '2', 'assertHist', 'abcABdefCDghi' ]
				]
			},
			{
				name: 'Conflicting deletions',
				initialData: [
					{ type: 'paragraph' },
					'a', 'b', 'c', 'A', 'B', 'd', 'e', 'f', 'C', 'D', 'g', 'h', 'i',
					{ type: '/paragraph' }
				],
				clients: [ '1', '2' ],
				ops: [
					// Client 1 delivers one deletion and leaves another one in the pipeline
					[ '1', 'apply', [
						[ 'remove', 5, 2, 10 ]
					] ],
					[ '1', 'assertHist', '-(Bd)!' ],
					[ '1', 'submit' ],
					[ '1', 'assertHist', '-(Bd)?' ],
					[ '1', 'apply', [
						[ 'remove', 3, 2, 10 ]
					] ],
					[ '1', 'assertHist', '-(Bd)?/-(cA)!' ],
					[ '1', 'submit' ],
					[ '1', 'assertHist', '-(Bd)-(cA)?' ],
					[ '1', 'deliver' ],
					[ 'server', 'assertHist', '-(Bd)' ],
					[ '1', 'receive' ],
					[ '1', 'assertHist', '-(Bd)/-(cA)?' ],

					// Client 2 applies a partially-conflicting change
					[ '2', 'apply', [
						[ 'insert', 1, [ 'W' ], 16 ],
						// Conflicts with undelivered deletion of 'cA'
						[ 'insert', 5, [ 'X' ], 13 ],
						// Conflicts with delivered deletion of 'Bd'
						[ 'insert', 8, [ 'Y' ], 11 ],
						[ 'insert', 12, [ 'Z' ], 8 ]
					] ],
					[ '2', 'assertHist', 'WXYZ!' ],
					[ '2', 'submit' ],
					[ '2', 'assertHist', 'WXYZ?' ],
					[ '2', 'receive' ],
					// Y conflicts with -(Bd), so Y and Z are discarded
					[ '2', 'assertHist', '-(Bd)/WX?' ],

					// Client 2 applies a "doomed" change built on top of a change that will conflict
					[ '2', 'apply', [
						[ 'insert', 1, [ 'V' ], 18 ]
					] ],
					[ '2', 'assertHist', '-(Bd)/WX?/V!' ],
					[ '2', 'submit' ],
					[ '2', 'assertHist', '-(Bd)/WXV?' ],

					// Client 1 delivers -(cA)
					[ '1', 'deliver' ],
					[ 'server', 'assertHist', '-(Bd)-(cA)' ],
					// Client 2 delivers W (accepted) and X (rejected)
					[ '2', 'deliver' ],
					[ '2', 'deliver' ],
					[ 'server', 'assertHist', '-(Bd)-(cA)W' ],
					// Client 2 receives -(cA), discards X and V
					[ '2', 'receive' ],
					[ '2', 'assertHist', '-(Bd)-(cA)/W?' ],

					// Client 2 inserts and submits P, server accepts
					[ '2', 'apply', [
						[ 'insert', 1, [ 'P' ], 16 ]
					] ],
					[ '2', 'assertHist', '-(Bd)-(cA)/W?/P!' ],
					[ '2', 'submit' ],
					[ '2', 'assertHist', '-(Bd)-(cA)/WP?' ],
					[ '2', 'deliver' ],
					[ 'server', 'assertHist', '-(Bd)-(cA)WP' ],

					// Client 2 receives confirmation of W and P
					[ '2', 'receive' ],
					[ '2', 'assertHist', '-(Bd)-(cA)W/P?' ],
					[ '2', 'receive' ],
					[ '2', 'assertHist', '-(Bd)-(cA)WP' ]
				]
			},
			{
				name: 'Double client-side rebase with annotation',
				initialData: [
					{ type: 'paragraph' },
					{ type: '/paragraph' },
					{ type: 'internalList' },
					{ type: '/internalList' }
				],
				clients: [ '1', '2' ],
				ops: [
					// Client 1 applies a local change that introduces an annotation
					[ '1', 'apply', {
						start: 0,
						transactions: [
							{
								operations: [
									{ type: 'retain', length: 1 },
									{ type: 'replace', remove: [], insert: [
										[ 'X', [ 'h123' ] ],
										[ 'Y', [ 'h123' ] ],
										[ 'Z', [ 'h123' ] ]
									] },
									{ type: 'retain', length: 3 }
								],
								author: '1'
							}
						],
						stores: [
							{
								hashes: [ 'h123' ],
								hashStore: {
									h123: {
										type: 'annotation',
										value: {
											type: 'textStyle/bold'
										}
									}
								}
							}
						],
						selections: {
							1: {
								type: 'linear',
								range: {
									type: 'range',
									from: 4,
									to: 4
								}
							}
						}
					} ],
					[ '1', 'assert', function ( assert, client ) {
						var unsubmitted = client.getChangeSince( client.sentLength, false );
						assert.deepEqual( unsubmitted.stores[ 0 ].hashes, [ 'h123' ], 'h123 is in the store' );
					} ],

					// Client 2 submits two changes
					[ '2', 'apply', [
						[ 'insert', 1, [ 'a' ], 3 ]
					] ],
					[ '2', 'submit' ],
					[ '2', 'apply', [
						[ 'insert', 2, [ 'b' ], 3 ]
					] ],
					[ '2', 'submit' ],

					// Client 1 rebases its local change twice
					[ '2', 'deliver' ],
					[ 'server', 'assertHist', 'a' ],
					[ '1', 'receive' ],
					[ '1', 'assertHist', 'a/XYZ!' ],
					[ '1', 'assert', function ( assert, client ) {
						var unsubmitted = client.getChangeSince( client.sentLength, false );
						assert.deepEqual( unsubmitted.stores[ 0 ].hashes, [ 'h123' ], 'h123 is still in the store after the first rebase' );
					} ],

					[ '2', 'deliver' ],
					[ 'server', 'assertHist', 'ab' ],
					[ '1', 'receive' ],
					[ '1', 'assertHist', 'ab/XYZ!' ],
					[ '1', 'assert', function ( assert, client ) {
						var unsubmitted = client.getChangeSince( client.sentLength, false );
						assert.deepEqual( unsubmitted.stores[ 0 ].hashes, [ 'h123' ], 'h123 is still in the store after the second rebase' );
					} ],

					// Client 1 submits its local change
					[ '1', 'submit' ],
					[ '1', 'deliver' ],
					[ 'server', 'assertHist', 'abXYZ' ]
				]
			}
		];

	function makeTransaction( doc, data ) {
		var i, method,
			builder = new ve.dm.TransactionBuilder();
		if ( data[ 0 ] === 'insert' ) {
			data = [
				[ 'pushRetain', data[ 1 ] ],
				[ 'pushReplace', doc, data[ 1 ], 0, data[ 2 ] ],
				[ 'pushRetain', data[ 3 ] ]
			];
		} else if ( data[ 0 ] === 'remove' ) {
			data = [
				[ 'pushRetain', data[ 1 ] ],
				[ 'pushReplace', doc, data[ 1 ], data[ 2 ], [] ],
				[ 'pushRetain', data[ 3 ] ]
			];
		}
		for ( i = 0; i < data.length; i++ ) {
			method = data[ i ].shift();
			builder[ method ].apply( builder, data[ i ] );
		}
		return builder.getTransaction();
	}

	for ( i = 0; i < cases.length; i++ ) {
		server = new ve.dm.TestRebaseServer();
		clients = { server: server };
		for ( j = 0; j < cases[ i ].clients.length; j++ ) {
			client = new ve.dm.TestRebaseClient( server, cases[ i ].initialData );
			client.setAuthor( cases[ i ].clients[ j ] );
			clients[ cases[ i ].clients[ j ] ] = client;
		}

		for ( j = 0; j < cases[ i ].ops.length; j++ ) {
			op = cases[ i ].ops[ j ];
			if ( op[ 0 ] === 'debugger' ) {
				// eslint-disable-next-line no-debugger
				debugger;
				continue;
			}

			client = clients[ op[ 0 ] ];
			action = op[ 1 ];
			if ( action === 'apply' ) {
				if ( Array.isArray( op[ 2 ] ) ) {
					txs = op[ 2 ].map( makeTransaction.bind( null, client.doc ) );
					client.applyTransactions( txs );
				} else {
					client.applyChange( ve.dm.Change.static.deserialize( op[ 2 ] ) );
				}
			} else if ( action === 'assertHist' ) {
				assert.equal( client.getHistorySummary(), op[ 2 ], cases[ i ].name + ': ' + ( op[ 3 ] || j ) );
			} else if ( action === 'submit' ) {
				client.submitChange();
			} else if ( action === 'deliver' ) {
				client.deliverOne();
			} else if ( action === 'receive' ) {
				client.receiveOne();
			} else if ( action === 'assert' ) {
				op[ 2 ]( assert, client );
			}
		}
	}
} );
