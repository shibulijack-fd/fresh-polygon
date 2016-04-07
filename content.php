<?php
/**
 * The default template for displaying content
 *
 * Used for both single and index/archive/search.
 *
 * @package WordPress
 * @subpackage Twenty_Thirteen
 * @since Twenty Thirteen 1.0
 */
?>
<div class="thumbnail">
<article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
	<header class="entry-header">

		<?php if ( has_post_thumbnail() && ! post_password_required() && ! is_attachment() ) : ?>
		<div class="entry-thumbnail">
			<?php the_post_thumbnail(); ?>
		</div>
		<?php endif; ?>

		<?php if ( is_single() ) : ?>
		<h1 class="entry-title text-center"><?php the_title(); ?></h1>
		<h3 class="top-space-small text-center">Written by <a href="<?php the_author_link(); ?>"><?php the_author(); ?></a> on <?php the_time('F j, Y'); ?></h3>
		<?php else : ?>
		<h3 class="banner-description"><a href="<?php the_author_link(); ?>"><?php the_author(); ?></a> about <?php echo human_time_diff( get_the_time('U'), current_time('timestamp') ) . ' ago'; ?></h3>
		<h1 class="entry-title text-center">
			<a href="<?php the_permalink(); ?>" rel="bookmark"><?php the_title(); ?></a>
		</h1>
		<?php endif; // is_single() ?>

	</header><!-- .entry-header -->

	<?php if ( is_search() ) : // Only display Excerpts for Search ?>
	<div class="entry-summary">
		<?php the_excerpt(); ?>
	</div><!-- .entry-summary -->
	<?php else : ?>
	<div class="entry-content">
		<?php
			/* translators: %s: Name of current post */
			// the_content( sprintf(
			// 	__( 'Continue reading %s <span class="meta-nav">&rarr;</span>', 'twentythirteen' ),
			// 	the_title( '<span class="screen-reader-text">', '</span>', false )
			// ) );
			// the_excerpt();
			wp_link_pages( array( 'before' => '<div class="page-links"><span class="page-links-title">' . __( 'Pages:', 'twentythirteen' ) . '</span>', 'after' => '</div>', 'link_before' => '<span>', 'link_after' => '</span>' ) );
		?>
	</div><!-- .entry-content -->
	<?php endif; ?>

</article><!-- #post -->
</div>