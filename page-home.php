<?php
/**
 * Template Name: Home
 *
 * @package WordPress
 * @subpackage Twenty_Thirteen
 * @since Twenty Thirteen 1.0
 */

get_header(); ?>

<div id="primary" class="content-area">
	<div id="content" class="site-content" role="main">


		<?php /* The loop */ ?>
		<?php while ( have_posts() ) : the_post(); ?>

			<article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>


				<div class="entry-content">
					<?php the_content(); ?>
					<?php wp_link_pages( array( 'before' => '<div class="page-links"><span class="page-links-title">' . __( 'Pages:', 'twentythirteen' ) . '</span>', 'after' => '</div>', 'link_before' => '<span>', 'link_after' => '</span>' ) ); ?>
				</div><!-- .entry-content -->

				<div class="entry-meta">
					<?php edit_post_link( __( 'Edit', 'twentythirteen' ), '<span class="edit-link">', '</span>' ); ?>
				</div><!-- .entry-meta -->
			</article><!-- #post -->

		<?php endwhile; ?>

	</div><!-- #content -->
</div><!-- #primary -->
<div class="bottom-wrapper-link "></div>
<div class="bottom-final-strip fc">
	<div class="bottom-strip"></div>
</div>	

<style>
	.bottom-final-strip,.bottom-strip,.bottom-wrapper-link{ background-color: #000000; }
	.bottom-strip{
		box-shadow: #000000 8px -6px 0px 24px;
		-webkit-box-shadow: #000000 8px -6px 0px 24px;
		-moz-box-shadow: #000000 8px -6px 0px 24px;
	}
	.light-grey .movember{ top:55px; }
	.freshservice-intro span.description { 
		display:  block;
		font-family: "Source Sans Pro", "Helvetica Neue", "Lucida Grande", sans-serif;
		  font-weight: 300;
		  text-rendering: optimizeLegibility;
	}
	.home-tour-wrapper .home-tour-content {
		font-size: 32px;
		  line-height: 1.4;
		  margin-top: 10px;
		  margin-bottom: 10px;
		  font-weight: 300;
	}
	.home-tour-wrapper .home-tour-link .tour-link-content span.tour-link-desc {
		margin-top: 10px;
		margin-bottom: 10px;
		display: block;
		line-height: 1.26;
	}
	footer{background-image:none;}
	@media (max-width: 45em){
		.company-logo-blocks .company-block img.movember{ top:15%; }
	}
</style>

<script type="text/javascript">// <![CDATA[
	var resizeWindow = function(){
		if ($(window).width() >= 640) {
			$('.home-banner-container')
			.height($(this).height());
		}
	}
// ]]></script>

<?php get_footer(); ?>