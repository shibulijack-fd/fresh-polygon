<?php
/**
 * Template Name: About
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
        <div class="fg-2">
            <div class="left-panel">
                <?php #$walker = new Menu_About; ?>
                <?php wp_nav_menu( array( 'theme_location' => 'about', 'container_class' => 'sticky-sidebar','menu_class' => 'nav nav-list nav-sidebar', 'menu_id' => 'menu-short' ) ); ?>
            </div>
        </div>
        <div class="fg-10 omega">
            <div class="right-panel">
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
        </div>
        <!-- #f10 -->
    </div>
    <!-- #lpage -->

    <?php get_footer(); ?>
