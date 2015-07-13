<?php
/**
 * The template for displaying 404 pages (Not Found)
 *
 * @package WordPress
 * @subpackage Twenty_Thirteen
 * @since Twenty Thirteen 1.0
 */

get_header(); ?>

    <div class="banner banner-404">
        <div class="l-page"><img class="zombie-tree" src="http://freshdesk.com/themes/freshdesk/images/404/zombi_tree.png" alt="" width="807px" height="614px">
            <div class="banner-404-info">
                <div class="woops-text">Whoops</div>
                <p><?php _e('This isn\'t a page we really intended upon you to stop by. There are scary zombies running around here, and you really shouldn\'t be walking by these places all by yourself.'); ?></p>
                <p><?php _e('In case you mistyped a URL or something, try typing the right one very slowly. If you clicked on a link, either within our site or from outside, fret not - get back to the safety of the home page and you should be ok. Here are some safe places you should jump to right away:'); ?></p>
                <?php wp_nav_menu( array( 'theme_location' => 'error' ) ); ?>
            </div>
        </div>
    </div>

<div class="footer-illusion">&nbsp;</div>

<?php get_footer(); ?>