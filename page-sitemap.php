<?php
/**
 * Template Name: Sitemap
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

 <div class="l-page fc" id="sitemap">
    <ul>
        <?php
            wp_list_pages(
                  array(
                    'exclude' => '',
                    'title_li' => '',
                  )
                );
        ?>
    </ul>
</div>
<script>
(function ($) {
	$(document).ready(function(){
        var elems = $("#sitemap").find("li");
        for(var i = 0; i < elems.length; i+=6) {
        elems.slice(i, i+6).wrapAll("<div class='m-container'></div>");
        }
        var $container = $('#sitemap');
   
    $container.imagesLoaded( function(){
      $container.masonry({
        itemSelector : '.m-container'
      });
    });
//		$('#sitemap li').each(function(){
//            $(this).add( $(this).nextUntil ("ul") ).wrapAll('<div class="box"></div>');
//        })
	});
	})(jQuery);
</script>
<style>
.m-container {
    margin: 10px;
}
</style>
    <?php get_footer(); ?>
