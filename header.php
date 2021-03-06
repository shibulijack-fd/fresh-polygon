<?php
/**
 * The Header template for our theme
 *
 * Displays all of the <head> section and everything up till <div id="main">
 *
 * @package WordPress
 * @subpackage Twenty_Thirteen
 * @since Twenty Thirteen 1.0
 */
?><!DOCTYPE html>
<!--[if IE 7]>
<html class="ie ie7" <?php language_attributes(); ?>>
<![endif]-->
<!--[if IE 8]>
<html class="ie ie8" <?php language_attributes(); ?>>
<![endif]-->
<!--[if !(IE 7) & !(IE 8)]><!-->
<html <?php language_attributes(); ?>>
<!--<![endif]-->
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width">
	<title><?php wp_title( '|', true, 'right' ); ?></title>
	<!--[if lt IE 9]>
	<script src="<?php echo get_template_directory_uri(); ?>/js/html5.js"></script>
	<![endif]-->
	<?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
	<div id="page" class="hfeed site">
		<header id="masthead" class="fd-header" role="banner">
			<div id="navbar" class="top-nav-strip">
				<div class="l-page">
					<button class="show-in-mobile menu-icon"></button>
					<nav id="site-navigation" class="top-site-nav" role="navigation">
						<!-- <button class="menu-toggle"><?php _e( 'Menu', 'twentythirteen' ); ?></button> -->
						<!-- <a class="screen-reader-text skip-link" href="#content" title="<?php esc_attr_e( 'Skip to content', 'twentythirteen' ); ?>"><?php _e( 'Skip to content', 'twentythirteen' ); ?></a> -->
						<?php $walker = new Menu_Navigation_Top; ?>
						<?php wp_nav_menu( array( 'theme_location' => 'primary', 'menu_class' => 'nav-menu', 'menu_id' => 'primary-menu', 'walker' => $walker ) ); ?>
						<?php //get_search_form(); ?>
					</nav><!-- #site-navigation -->
				</div><!-- #l-page -->
			</div><!-- #navbar -->
			<div class="header fd-sticky fc">
				<section class="fd-home-sticky">
					<div class="l-page"> 
						<a href="<?php echo get_site_url(); ?>" class="fd-logo"></a>
						<button class="show-in-mobile menu-icon"></button>
						<label for="gss_pane_toggle">
							<i class="show-in-mobile btn btn-banner btn-flat btn-light icon-gss"></i>
						</label>
						<nav class="site-nav">
							<?php $walker = new Menu_With_Description; ?>
							<?php wp_nav_menu( array( 'theme_location' => 'secondary', 'menu_class' => 'nav-menu', 'menu_id' => 'main-menu' , 'walker' => $walker) ); ?>
						</nav>
					</div>
				</section>
			</div>

			
		</header><!-- #masthead -->
		<?php get_template_part( 'partials/site-search'); ?>
		<div id="main" class="site-main">