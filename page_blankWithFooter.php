<?php
/**
 * Template Name: Blank with Primary Footer
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

					
				</article><!-- #post -->

			<?php endwhile; ?>

		</div><!-- #content -->
	</div><!-- #primary -->

<div class="primary-footer">
	<div class="l-page">
      <hr>
        
		<div class="pf-heading top-space-medium align-center">
			<h2>40,000 Customers</h2>
			<h4>Some of the world’s biggest brands use Freshdesk for their support.</h4>
		</div>
        <div class="jquery-script-clear"></div>
        <div class="box-slider boxroll-slider">
			<div class="item boxroll-slider-item" style="transform: rotateX(-90deg) translate3d(0px, 85px, 85px); opacity: 1; z-index: -1; visibility: hidden;"><img src="http://freshdesk.com/files/3514/2062/7316/slide-01.jpg"></div>
			<div class="item boxroll-slider-item" style="transform: rotateX(-90deg) translate3d(0px, 85px, 85px); visibility: hidden; z-index: -1; opacity: 1;"><img src="http://freshdesk.com/files/7014/2062/7313/slide-02.jpg"></div>
			<div class="item boxroll-slider-item" style="transform: rotateX(-90deg) translate3d(0px, 85px, 85px); visibility: hidden; z-index: -1; opacity: 1;"><img src="http://freshdesk.com/files/5014/2062/7310/slide-03.jpg"></div>
			<div class="item boxroll-slider-item" style="transform: rotateX(0deg) translate3d(0px, 0px, 0px); visibility: visible; z-index: 1; opacity: 1;"><img src="http://freshdesk.com/files/1814/3151/4122/slid4.jpg"></div>
			<div class="item boxroll-slider-item" style="transform: rotateX(-90deg) translate3d(0px, 85px, 85px); visibility: hidden; z-index: -1; opacity: 1;"><img src="http://freshdesk.com/files/5314/2062/7304/slide-05.jpg"></div>
		</div>
	
		
		<div class="pf-signup align-center fc">
			<a href="/signup" class="btn btn-large">Get Started for free</a>
		</div>
 
	</div>
    
</div>
<div id="y-breadcrumbs">
<?php 
if ( function_exists( 'yoast_breadcrumb' ) ) {
	yoast_breadcrumb();
}
?>
</div>
<script>
(function ($) {
	$(document).ready(function(){
		$("#y-breadcrumbs").hide();
		var breadcrumbs = $("#y-breadcrumbs").html();
		$(".breadcrumb").append(breadcrumbs);
		$("#y-breadcrumbs").remove();
	});
})(jQuery);
</script>
<style>.w-grey-features{background-color:#fff; border:0; }</style>

<?php get_footer(); ?>