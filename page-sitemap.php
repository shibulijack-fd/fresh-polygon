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

<div class="breadcrumb l-page fc">
    <?php 
    if ( function_exists( 'yoast_breadcrumb' ) ) {
        yoast_breadcrumb();
    }
    ?>
</div>

<div class="l-page fc" id="sitemap">
    <ul id="sitemapContainer">
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

        var $container = $('#sitemap');
        $container.masonry({
                itemSelector : 'ul#sitemapContainer> li'
        });

   });
   })(jQuery);
</script>
<style>
    #sitemap {
        margin-top: 20px;
    }
     #sitemap > .page_item {
         margin-top: 10px;
     }
     #sitemap .page_item_has_children {
         /*margin-top: 20px;*/
     }
      #sitemap a, #sitemap a:visited  {
            color:  #333333;
    }
     #sitemap a:hover  {
            color:  #555555;
    }
    #sitemap .children {
        /*padding-left:  10px;*/
    }
     #sitemap .children a {
         color:  #18ad90;
         margin-top:  10px;
     }
    #sitemap .children a:hover {
        color: #395b54;
    }
    ul#sitemapContainer> li{
        width: 18%;
        padding-right: 2%;
    }
    ul#sitemapContainer > li {
        margin-top: 10px;
    }
</style>
<?php get_footer(); ?>
