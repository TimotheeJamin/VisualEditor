<?php
/**
 * VisualEditor standalone demo
 *
 * @file
 * @ingroup Extensions
 * @copyright 2011-2012 VisualEditor Team and others; see AUTHORS.txt
 * @license The MIT License (MIT); see LICENSE.txt
 */

$path = dirname( __FILE__ ) . '/pages';
$pages = glob( $path . '/*.html' );
$page = current( $pages );
if ( isset( $_GET['page'] ) && in_array( $path . '/' . $_GET['page'] . '.html', $pages ) ) {
	$page =  $path . '/' . $_GET['page'] . '.html';
}
$html = '<div>' . file_get_contents( $page ) . '</div>';

?>
<!DOCTYPE html>

<html>
	<head>
		<meta charset="UTF-8" />
		<title>VisualEditor Standalone Demo</title>
		<!-- init -->
		<link rel="stylesheet" href="../../modules/ve/init/sa/styles/ve.init.sa.css">
		<!-- ce -->
		<link rel="stylesheet" href="../../modules/ve/ce/styles/ve.ce.DocumentNode.css">
		<link rel="stylesheet" href="../../modules/ve/ce/styles/ve.ce.Node.css">
		<link rel="stylesheet" href="../../modules/ve/ce/styles/ve.ce.Surface.css">
		<!-- ui -->
		<link rel="stylesheet" href="../../modules/ve/ui/styles/ve.ui.Context.css">
		<link rel="stylesheet" href="../../modules/ve/ui/styles/ve.ui.Inspector.css">
		<link rel="stylesheet" href="../../modules/ve/ui/styles/ve.ui.Menu.css">
		<link rel="stylesheet" href="../../modules/ve/ui/styles/ve.ui.Surface.css">
		<link rel="stylesheet" href="../../modules/ve/ui/styles/ve.ui.Toolbar.css">
		<script>
			if ( window.devicePixelRatio > 1 ) {
				document.write( '<link rel="stylesheet" href="../../modules/ve/ui/styles/ve.ui.Icons-vector.css">' );
			} else {
				document.write( '<link rel="stylesheet" href="../../modules/ve/ui/styles/ve.ui.Icons-raster.css">' );
			}
		</script>
		<!-- demo -->
		<link rel="stylesheet" href="demo.css">
	</head>
	<body>
		<ul class="ve-demo-docs">
			<?php foreach( $pages as $page ): ?>
				<li>
					<a href="./?page=<?php echo basename( $page, '.html' ); ?>">
						<?php echo basename( $page, '.html' ); ?>
					</a>
				</li>
			<?php endforeach; ?>
		</ul>
		<div class="ve-demo-content"></div>

		<!-- Rangy -->
		<script src="../../modules/rangy/rangy-core.js"></script>
		<script src="../../modules/rangy/rangy-position.js"></script>

		<!-- ve -->
		<script src="../../modules/jquery/jquery.js"></script>
		<script src="../../modules/jquery/jquery.json.js"></script>
		<script src="../../modules/jquery/jquery.multiSuggest.js"></script>
		<script src="../../modules/ve/ve.js"></script>
		<script src="../../modules/ve/ve.debug.js"></script>
		<script src="../../modules/ve/ve.EventEmitter.js"></script>
		<script src="../../modules/ve/ve.Factory.js"></script>
		<script src="../../modules/ve/ve.Position.js"></script>
		<script src="../../modules/ve/ve.Range.js"></script>
		<script src="../../modules/ve/ve.Node.js"></script>
		<script src="../../modules/ve/ve.BranchNode.js"></script>
		<script src="../../modules/ve/ve.LeafNode.js"></script>
		<script src="../../modules/ve/ve.Surface.js"></script>
		<script src="../../modules/ve/ve.Document.js"></script>
		<script src="../../modules/ve/ve.OrderedHashSet.js"></script>
		<script src="../../modules/ve/ve.AnnotationSet.js"></script>

		<!-- init -->
		<script src="../../modules/ve/init/ve.init.js"></script>
		<script src="../../modules/ve/init/ve.init.Platform.js"></script>
		<script src="../../modules/ve/init/sa/ve.init.sa.js"></script>
		<script src="../../modules/ve/init/sa/ve.init.sa.Platform.js"></script>
		<script>
			<?php
				include( dirname( dirname( dirname( __FILE__ ) ) ) . '/VisualEditor.i18n.php' );
				echo 've.init.platform.addMessages( ' . json_encode( $messages['en'] ) . ');';
			?>
			ve.init.platform.setModulesUrl( '../../modules' );
		</script>

		<!-- dm -->
		<script src="../../modules/ve/dm/ve.dm.js"></script>
		<script src="../../modules/ve/dm/ve.dm.NodeFactory.js"></script>
		<script src="../../modules/ve/dm/ve.dm.AnnotationFactory.js"></script>
		<script src="../../modules/ve/dm/ve.dm.Node.js"></script>
		<script src="../../modules/ve/dm/ve.dm.BranchNode.js"></script>
		<script src="../../modules/ve/dm/ve.dm.LeafNode.js"></script>
		<script src="../../modules/ve/dm/ve.dm.Annotation.js"></script>
		<script src="../../modules/ve/dm/ve.dm.TransactionProcessor.js"></script>
		<script src="../../modules/ve/dm/ve.dm.Transaction.js"></script>
		<script src="../../modules/ve/dm/ve.dm.Surface.js"></script>
		<script src="../../modules/ve/dm/ve.dm.Document.js"></script>
		<script src="../../modules/ve/dm/ve.dm.DocumentSynchronizer.js"></script>
		<script src="../../modules/ve/dm/ve.dm.Transaction.js"></script>
		<script src="../../modules/ve/dm/ve.dm.TransactionProcessor.js"></script>
		<script src="../../modules/ve/dm/ve.dm.Converter.js"></script>

		<script src="../../modules/ve/dm/nodes/ve.dm.AlienInlineNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.AlienBlockNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.BreakNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.CenterNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.DefinitionListItemNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.DefinitionListNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.DocumentNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.HeadingNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.ImageNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.ListItemNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.ListNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.MetaBlockNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.MetaInlineNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.ParagraphNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.PreformattedNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.TableCellNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.TableNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.TableRowNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.TableSectionNode.js"></script>
		<script src="../../modules/ve/dm/nodes/ve.dm.TextNode.js"></script>

		<script src="../../modules/ve/dm/annotations/ve.dm.LinkAnnotation.js"></script>
		<script src="../../modules/ve/dm/annotations/ve.dm.TextStyleAnnotation.js"></script>

		<!-- ce -->
		<script src="../../modules/ve/ce/ve.ce.js"></script>
		<script src="../../modules/ve/ce/ve.ce.NodeFactory.js"></script>
		<script src="../../modules/ve/ce/ve.ce.Document.js"></script>
		<script src="../../modules/ve/ce/ve.ce.Node.js"></script>
		<script src="../../modules/ve/ce/ve.ce.BranchNode.js"></script>
		<script src="../../modules/ve/ce/ve.ce.LeafNode.js"></script>
		<script src="../../modules/ve/ce/ve.ce.Surface.js"></script>

		<script src="../../modules/ve/ce/nodes/ve.ce.AlienInlineNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.AlienBlockNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.BreakNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.CenterNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.DefinitionListItemNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.DefinitionListNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.DocumentNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.HeadingNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.ImageNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.ListItemNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.ListNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.MetaBlockNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.MetaInlineNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.ParagraphNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.PreformattedNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.TableCellNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.TableNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.TableRowNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.TableSectionNode.js"></script>
		<script src="../../modules/ve/ce/nodes/ve.ce.TextNode.js"></script>

		<!-- ui -->
		<script src="../../modules/ve/ui/ve.ui.js"></script>
		<script src="../../modules/ve/ui/ve.ui.Inspector.js"></script>
		<script src="../../modules/ve/ui/ve.ui.Tool.js"></script>
		<script src="../../modules/ve/ui/ve.ui.Toolbar.js"></script>
		<script src="../../modules/ve/ui/ve.ui.Context.js"></script>
		<script src="../../modules/ve/ui/ve.ui.Menu.js"></script>

		<script src="../../modules/ve/ui/inspectors/ve.ui.LinkInspector.js"></script>

		<script src="../../modules/ve/ui/tools/ve.ui.ButtonTool.js"></script>
		<script src="../../modules/ve/ui/tools/ve.ui.AnnotationButtonTool.js"></script>
		<script src="../../modules/ve/ui/tools/ve.ui.ClearButtonTool.js"></script>
		<script src="../../modules/ve/ui/tools/ve.ui.HistoryButtonTool.js"></script>
		<script src="../../modules/ve/ui/tools/ve.ui.ListButtonTool.js"></script>
		<script src="../../modules/ve/ui/tools/ve.ui.IndentationButtonTool.js"></script>
		<script src="../../modules/ve/ui/tools/ve.ui.DropdownTool.js"></script>
		<script src="../../modules/ve/ui/tools/ve.ui.FormatDropdownTool.js"></script>

		<!-- demo -->
		<script>
			$(document).ready( function() {
				new ve.Surface(
					$( '.ve-demo-content' ),
					$( <?php echo json_encode( $html ) ?> )[0]
				);
				$( '.ve-ce-documentNode' ).focus();
			} );
		</script>

		<div style="margin-left: 2em; margin-right: 2em; margin-bottom: 1em;">
			<labe>Start</label>
			<input type="text" style="width: 3em" id="ve-debug-start"/>
			<labe>End</label>
			<input type="text" style="width: 3em" id="ve-debug-end"/>
			<br/>
			<a href="#" id="ve-get-range">Get range from the editor</a>
			<br/>
			<a href="#" id="ve-dump-data">Dump data to the console</a>
			<br/>
			<a href="#" id="ve-dump-all">Dump all data</a>
			<br/><br/>
			<table id="ve-dump" border="1" width="100%" style="display: none;">
				<tr>
					<td>Linear model</td>
					<td>View tree</td>
					<td>Model tree</td>
				</tr>
				<tr>
					<td width="30%" id="ve-linear-model-dump"></td>
					<td id="ve-view-tree-dump" style="vertical-align: top;"></td>
					<td id="ve-model-tree-dump" style="vertical-align: top;"></td>
				</tr>
			</table>
		</div>

		<script>
		$( function() {
			$( '#ve-dump-all' ).on( "click", function( e ) {
				// linear model dump
				var $ol = $('<ol start=0></ol>'),
					$li,
					element,
					html,
					annotations;

				for ( var i = 0; i < ve.instances[0].documentModel.data.length; i++ ) {
					$li = $('<li></li>');
					element = ve.instances[0].documentModel.data[i];
					if( element.type ) {
						html = element.type;
					} else if ( element.length > 1 ){
						annotations = [];
						$.each(element[1], function(index, val) {
							annotations.push( val.type );

						});
						html = element[0] + ' [' + annotations.join(', ') + ']';
					} else {
						html = element;
					}

					$li.html ( html );
					$ol.append($li);
				}
				$('#ve-linear-model-dump').html($ol);

				// tree dump
				var getKids = function( obj ) {
					var $ol = $('<ol start=0></ol>'),
						$li;
					for( var i = 0; i < obj.children.length; i++ ) {
						$li = $('<li></li>');
						$li.html(obj.children[i].type);

						if ( obj.children[i].children ) {
							$li.append(getKids(obj.children[i]));
						}


						$ol.append($li);
					}
					return $ol;
				}
				$('#ve-model-tree-dump').html(getKids(ve.instances[0].documentModel.documentNode));
				$('#ve-view-tree-dump').html(getKids(ve.instances[0].view.documentView.documentNode));
				$('#ve-dump').show();
				e.preventDefault();
				return false;
			} );
			$( '#ve-get-range' ).on( "click", function( e ) {
				var range = ve.instances[0].view.model.getSelection();
				$( '#ve-debug-start' ).val( range.start );
				$( '#ve-debug-end' ).val( range.end );
				e.preventDefault();
				return false;
			} );
			$( '#ve-dump-data' ).on( "click", function( e ) {
				var	start = $( '#ve-debug-start' ).val(),
					end = $( '#ve-debug-end' ).val();
				// TODO: Validate input
				console.dir( ve.instances[0].view.documentView.model.data.slice( start, end ) );
				e.preventDefault();
				return false;
			} );
		} );
		</script>
	</body>
</html>
