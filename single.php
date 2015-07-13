<?php
/**
 * The template for displaying all single posts
 *
 * @package WordPress
 * @subpackage Twenty_Thirteen
 * @since Twenty Thirteen 1.0
 */

get_header(); ?>

 <div class="banner">
        <div class="l-page no-clear align-center">
            <h2 class="s-heading"><?php echo the_title(); ?></h2>
        </div>
    </div>

<div class="l-page fc">
	<div id="primary" class="content-area">
		<div id="content" class="site-content" role="main">

			<?php /* The loop */ ?>
			<?php while ( have_posts() ) : the_post(); ?>

				<?php get_template_part( 'content', get_post_format() ); ?>
				<?php #twentythirteen_post_nav(); ?>
				<?php #comments_template(); ?>

			<?php endwhile; ?>

		</div><!-- #content -->
	</div><!-- #primary -->
</div>
<?php #get_sidebar(); ?>
<?php get_footer(); ?>