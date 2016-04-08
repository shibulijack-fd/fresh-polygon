<?php
/**
 * The main template file
 *
 * This is the most generic template file in a WordPress theme and one of the
 * two required files for a theme (the other being style.css).
 * It is used to display a page when nothing more specific matches a query.
 * For example, it puts together the home page when no home.php file exists.
 *
 * @link https://codex.wordpress.org/Template_Hierarchy
 *
 * @package WordPress
 * @subpackage Twenty_Thirteen
 * @since Twenty Thirteen 1.0
 */

get_header(); ?>
<?php query_posts('offset=4'); ?>
 <div class="banner" id="index">
 <?php
 if( function_exists('fa_display_slider') ){
     fa_display_slider( 7585 );
 }
 ?>
    </div>
<div class="l-page fc">

	<div id="primary" class="content-area">
		<div id="content" class="site-content" role="main">
		<?php if ( have_posts() ) : ?>

			<?php /* The loop */ ?>
			<?php while ( have_posts() ) : the_post(); ?>
				<?php get_template_part( 'content', get_post_format() ); ?>
			<?php endwhile; ?>

		<?php else : ?>
			<?php get_template_part( 'content', 'none' ); ?>
		<?php endif; ?>

		</div><!-- #content -->
	</div><!-- #primary -->
</div>
<?php #get_sidebar(); ?>
<?php get_footer(); ?>
<style>
body {
	background: #e6e6e6;
}
.banner {
	padding-top: 100px;
	padding-bottom: 0;
    margin-bottom: 30px;
    -webkit-box-shadow: 0 0 15px -2px rgba(0, 0, 0, 0.2);
    -moz-box-shadow: 0 0 15px -2px rgba(0, 0, 0, 0.2);
    box-shadow: 0 0 15px -2px rgba(0, 0, 0, 0.2);
}
.fa_slider_simple.default .fa_slide_content h2 {
	font-size: 18px;
	font-weight: 500;
	text-shadow: none;
}
</style>