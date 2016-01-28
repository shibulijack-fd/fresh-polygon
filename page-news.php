<?php
/**
 * Template Name: News
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
        <div class="fg-3">
            <div class="left-panel">
            <div class="sticky-sidebar">
                <div class="panel-left">			
                    <ul class="nav nav-list nav-sidebar nav-years" id="year-panel"> </ul>
                </div>
                </div>
            </div>
                <script type="text/javascript">
                !function(a){a(function(){"use strict";if(!window.page.edit_mode){var e={},i=0;a("#year-panel").empty(),a.each(a(".press-item"),function(a,s){var t=s.id.split("-")[1],n=s.id.split("-")[0];void 0===e[t]&&(e[t]={},i=0),void 0===e[t][n]&&(e[t][n]=i++)}),a.each(e,function(e,i){var s=a("<a id='year-"+e+"'>"+e+"</a>"),t=a("<li></li>").append(s),n=a("<ul class='nav nav-list nav-sidebar nav-months'></ul>");a.each(i,function(a,i){var t="#"+a+"-"+e;n.append("<li><a href='"+t+"'>"+a+"</a></li>"),0==i&&s.attr("href",t)}),t.append(n).prependTo("#year-panel")}),a("#year-panel li").first().addClass("active").find("li").first().addClass("active"),a(".press-item").last().addClass("stick-stop"),a(".press-item").waypoint({offset:"65px",handler:function(e){var i=a("[href=#"+this.id+"]"),s=a("#year-"+this.id.split("-")[1]),t="down"==e?i.parent():i.parent().prev(),n=s.parent();t.get(0)&&t.addClass("active").siblings().removeClass("active"),n.get(0)&&n.addClass("active").siblings().removeClass("active")}}),a("#year-panel a").smoothScroll({ offset: -65 })}})}(window.jQuery);
                </script>
        </div>
        <div class="fg-9 omega">
            <div class="right-panel">
            <?php query_posts('post_type=post&post_status=publish&category_name=news'); ?>
            <?php if( have_posts() ): ?>
                <?php while( have_posts() ): the_post(); ?>
                    <div id="<?php echo get_the_date('F-Y') ?>" class="press-item">
                            <div class="text-highlight press-date"><?php echo get_the_date(); ?></div>
                            <div class="pull-right"><?php the_post_thumbnail( array(200,220) ); ?></div>
                            <h3><?php the_title(); ?></h3>
                            <p><?php the_content(); ?></p>
                        </div><!-- /#post-<?php get_the_ID(); ?> -->
                <?php endwhile; ?>
            <?php else: ?>
                <div id="post-404" class="noposts">
                    <p><?php _e('None found in news category.','example'); ?></p>
                </div><!-- /#post-404 -->
            <?php endif; wp_reset_query(); ?>
            </div>
        </div>
        <!-- #f10 -->
    </div>
    <!-- #lpage -->
<script>
 (function ($) {
    $(document).ready(function(){
        if($(window).width() >= 768)  {
            var rightPanelHeight = $(".right-panel").height();
            $(".left-panel").height(rightPanelHeight);
        }     
});
})(jQuery);
</script>
<style>
footer {
    margin-top: 0;
}
</style>
<?php get_footer(); ?>