<?php
/**
 * The template for displaying Category pages
 *
 * @link https://codex.wordpress.org/Template_Hierarchy
 *
 * @package WordPress
 * @subpackage Twenty_Thirteen
 * @since Twenty Thirteen 1.0
 */

get_header(); ?>

<div class="banner" id="category">
	<div class="l-page no-clear align-center">
		<h1 class="k-heading">Category Archives</h1>
		<h2 class="s-heading"><?php printf( __( '%s', 'twentythirteen' ), single_cat_title( '', false ) ); ?></h2>
		<?php if ( category_description() ) : // Show an optional category description ?>
			<div class="banner-description"><p><span>Freshdesk integrates with your other critical systems so you have the information you need when and where you need it.</span></p></div>
		<?php endif; ?>
	</div>
</div>

<div class="l-page fc">
	<div id="primary" class="content-area">
		<div id="content" class="site-content" role="main">
		<?php if ( have_posts() ) : ?>
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
</style>