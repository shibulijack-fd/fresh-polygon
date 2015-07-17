<?php
/**
 * Template Name: Tour
 *
 * @package WordPress
 * @subpackage Twenty_Thirteen
 * @since Twenty Thirteen 1.0
 */

get_header(); ?>
<div id="primary" class="content-area">
    <div id="content" class="site-content" role="main">
     <div id="loader"></div>
     <!-- Secondary Banner starts -->
     <?php get_template_part( 'partials/tour', 'slideshow' ); ?>
     <div class="tour-features-strip fc navbar-x">
        <div class="l-page fc">
            <div class="menucontainer">
                <?php $walker = new Menu_Tour; ?>
                <?php wp_nav_menu( array( 'theme_location' => 'tour', 'container_class' => 'menuholder','menu_class' => 'nav-tour-strip nav nav-pills', 'menu_id' => 'tour-menu' , 'walker' => $walker) ); ?>
            </div>
        </div>
    </div>
    <!-- Secondary Banner ends -->

    <?php /* The loop */ ?>
    <?php while ( have_posts() ) : the_post(); ?>

        <article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
            <div class="entry-content">
                <?php the_content(); ?>
                <?php wp_link_pages( array( 'before' => '<div class="page-links"><span class="page-links-title">' . __( 'Pages:', 'twentythirteen' ) . '</span>', 'after' => '</div>', 'link_before' => '<span>', 'link_after' => '</span>' ) ); ?>
            </div>
            <!-- .entry-content -->

            <div class="entry-meta">
                <?php edit_post_link( __( 'Edit', 'twentythirteen' ), '<span class="edit-link">', '</span>' ); ?>
            </div>
            <!-- .entry-meta -->
        </article>
        <!-- #post -->

    <?php endwhile; ?>

</div>
<!-- #content -->
</div>
<!-- #primary -->

<?php get_footer(); ?>
