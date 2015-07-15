<?php
/**
 * The template for displaying the footer
 *
 * Contains footer content and the closing of the #main and #page div elements.
 *
 * @package WordPress
 * @subpackage Twenty_Thirteen
 * @since Twenty Thirteen 1.0
 */
?>

</div><!-- #main -->
<footer id="colophon" class="site-footer" role="contentinfo">
	<?php get_sidebar( 'main' ); ?>

	<div class="l-page fc copy-separator" id="nl-page">
		<div class="fg-6 footer-bottom-link">
			<ul class="clearfix">
				<li><a href="http://freshdesk.com/terms">TERMS OF SERVICE</a></li>
				<li><a href="http://freshdesk.com/privacy">PRIVACY POLICY</a></li>
				<li><a href="<?php echo get_site_url(); ?>/sitemap">SITEMAP</a></li>
			</ul>
		</div>
		<div class="fg-5 omega copy">
			Copyright © Freshdesk Inc. All Rights Reserved.
		</div>
	</div><!-- #copyright content -->

	<div class="fresh-widgets">
		<div class="support-widget">
			<i class="icon-support"></i><span class="light">Support</span>
		</div>
		<div class="chat-widget" id="chat-widget">
			<i class="icon-chat"></i><span class="light">Chat with us</span>
		</div>
	</div><!-- #fresh-widgets -->
</footer><!-- #colophon -->
</div><!-- #page -->

<?php wp_footer(); ?>
</body>
</html>