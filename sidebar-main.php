<?php
/**
 * The sidebar containing the footer widget area
 *
 * If no active widgets in this sidebar, hide it completely.
 *
 * @package WordPress
 * @subpackage Twenty_Thirteen
 * @since Twenty Thirteen 1.0
 */

if ( is_active_sidebar( 'sidebar-1' ) ) : ?>
	<div id="secondary" class="l-page clearfix footer-wrapper" role="complementary">

			<?php dynamic_sidebar( 'sidebar-1' ); ?>

		<!-- .widget-area -->
	</div><!-- #secondary -->
<?php endif; ?>