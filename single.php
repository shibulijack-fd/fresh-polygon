<?php
/**
 * The template for displaying all single posts
 *
 * @package WordPress
 * @subpackage Twenty_Thirteen
 * @since Twenty Thirteen 1.0
 */

get_header(); ?>

<?php 
the_post(); 
$categories = get_the_category();
 
if ( ! empty( $categories ) ) {
    $primaryCategory = esc_html( $categories[0]->name );   
}
?>

<div class="inner-banner-strip">
	<div class="l-page no-clear">
		<div class="banner-image">
			<?php
			if ( has_post_thumbnail() ) {
				the_post_thumbnail(); 
			}
			?>		
		</div>
		<div class="banner-meta">
			<h1 class="k-heading"><?php echo $primaryCategory; ?></h1>    		
			<h2 class="s-heading top-space-large"><?php the_title(); ?></h2>
			<div class="w-grey">
				<div class="l-page clearfix">
					<div class="banner-description">Written by <a href="<?php the_author_link(); ?>"><?php the_author(); ?></a> on <?php the_time('F j, Y'); ?></div>

				</div>
			</div>
		</div>
	</div>
</div>

<div class="l-page fc top-space-large">
	<div id="primary" class="content-area">
		<div id="content" class="site-content" role="main">

			<?php 			
			the_content( sprintf(
				__( 'Continue reading %s <span class="meta-nav">&rarr;</span>', 'twentythirteen' ),
				the_title( '<span class="screen-reader-text">', '</span>', false )
			) ); 
			?>

		</div><!-- #content -->
	</div><!-- #primary -->
</div>
<?php #get_sidebar(); ?>
<?php get_footer(); ?>
<style>
.banner-meta {
	padding-top: 50px;
}
.banner-meta .s-heading {
	margin-top: 20px;
}
.inner-banner-strip {
	padding-top: 120px;
	padding-bottom: 20px;

}
.inner-banner-strip .w-grey {
	border: 0;
	padding-top: 0;
    font-weight: 300;

}
.inner-banner-strip .banner-image img {
	-webkit-mask-box-image: none;
	border: 2px solid #ccc;
	    border-top-right-radius: 0;
	    border-bottom-left-radius: 0;
}
</style>